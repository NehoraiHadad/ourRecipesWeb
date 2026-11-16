import torch
from torch import nn
import torch.nn.functional as F

from torch.nn import BCEWithLogitsLoss, CrossEntropyLoss, MSELoss
from torch.nn.functional import scaled_dot_product_attention

from typing import Optional, Tuple, Union
import numpy as np

try:
    from xformers.ops import SwiGLU
except:
    class SwiGLU(nn.Module):
        """
        A Module that mimicks the call to :attr:`xformers.ops.swiglu`,
        and holds the weights for the 3 linear layers
        """
        def __init__(
            self,
            in_features: int,
            hidden_features: int,
            out_features: Optional[int] = None,
            bias: bool = True,
            *,
            _pack_weights: bool = True,
        ) -> None:
            """Create a SwiGLU module

            Args:
                in_features (int): Number of features of the input
                hidden_features (int): Number of hidden features
                out_features (Optional[int], optional): Number of features of the input. Defaults to None.
                bias (bool, optional): Whether linear layers also include a bias. Defaults to True.
            """
            super().__init__()
            out_features = out_features or in_features
            hidden_features = hidden_features or in_features

            self.w12: Optional[nn.Linear]
            if _pack_weights:
                self.w12 = nn.Linear(in_features, 2 * hidden_features, bias=bias)
            else:
                self.w12 = None
                self.w1 = nn.Linear(in_features, hidden_features, bias=bias)
                self.w2 = nn.Linear(in_features, hidden_features, bias=bias)
            self.w3 = nn.Linear(hidden_features, out_features, bias=bias)

            self.hidden_features = hidden_features
            self.out_features = out_features
            self.in_features = in_features
            self.op: Optional[SwiGLUOp] = None

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            """Computes :attr:`swiglu` with the module's weights

            Args:
                x (torch.Tensor): A Tensor of shape ``[..., in_features]``

            Returns:
                torch.Tensor: A Tensor of shape ``[..., out_features]``
            """
            if self.w12 is not None:
                gate, x = self.w12(x).chunk(2, dim=-1)
                hidden = F.silu(gate) * x
            else:
                x1 = self.w1(x)
                x2 = self.w2(x)
                hidden = F.silu(x1) * x2

            return self.w3(hidden)


try:
    from flash_attn.flash_attn_interface import flash_attn_varlen_func

    FLASH_ATTN_AVAILABLE = True
except ImportError:
    FLASH_ATTN_AVAILABLE = False

from transformers import (
    PreTrainedModel,
    PretrainedConfig,
    DataCollatorForLanguageModeling,
)
from transformers.modeling_outputs import (
    BaseModelOutput,
    MaskedLMOutput,
    SequenceClassifierOutput,
    TokenClassifierOutput,
    QuestionAnsweringModelOutput
)

import torch
from typing import Tuple

def precompute_freqs(dim: int, end: int, theta: float = 10000.0, *, device=None, dtype=torch.float32):
    """
    Returns (cos, sin) tensors of shape [end, dim//2], no complex dtype.
    """
    h = dim // 2
    idx = torch.arange(0, h, device=device, dtype=dtype)
    inv_freq = 1.0 / (theta ** ((2.0 * idx) / dim))
    t = torch.arange(end, device=device, dtype=dtype)
    angles = torch.outer(t, inv_freq)                         # [L, h]
    return angles.cos(), angles.sin()   # ([L, h], [L, h])

def reshape_for_broadcast(freqs: torch.Tensor, x: torch.Tensor):
    # freqs: [L, h]; x: [B, L, H, h] for the half-dim tensors
    assert freqs.shape == (x.shape[1], x.shape[-1]), (freqs.shape, x.shape)
    return freqs[None, :, None, :]                            # [1, L, 1, h]

# Rotary embedding without complex numbers (megatron-core pairing: first half with second half)
def apply_rotary_emb(xq: torch.Tensor, xk: torch.Tensor, freqs: tuple[torch.Tensor, torch.Tensor]):
    # x*: [B, L, H, D]; freqs = (cos[L,h], sin[L,h])
    D = xq.shape[-1]
    h = D // 2
    xq1, xq2 = xq[..., :h], xq[..., h:]
    xk1, xk2 = xk[..., :h], xk[..., h:]

    cos, sin = freqs
    cos = reshape_for_broadcast(cos.type_as(xq1), xq1)        # [1, L, 1, h]
    sin = reshape_for_broadcast(sin.type_as(xq1), xq1)        # [1, L, 1, h]

    q1 = xq1 * cos - xq2 * sin
    q2 = xq1 * sin + xq2 * cos
    k1 = xk1 * cos - xk2 * sin
    k2 = xk1 * sin + xk2 * cos

    return torch.cat([q1, q2], dim=-1), torch.cat([k1, k2], dim=-1)

class NeoBERTEagerRMSNorm(nn.Module):
    def __init__(self, hidden_size, eps=1e-6):
        """
        NeoBERTEagerRMSNorm is equivalent to nn.RMSNorm
        """
        super().__init__()
        self.weight = nn.Parameter(torch.ones(hidden_size))
        self.variance_epsilon = eps

    def forward(self, hidden_states):
        input_dtype = hidden_states.dtype
        hidden_states = hidden_states.to(torch.float32)
        variance = hidden_states.pow(2).mean(-1, keepdim=True)
        hidden_states = hidden_states * torch.rsqrt(variance + self.variance_epsilon)
        return self.weight * hidden_states.to(input_dtype)

    def extra_repr(self):
        return f"{tuple(self.weight.shape)}, eps={self.variance_epsilon}"


class NeoBERTConfig(PretrainedConfig):
    model_type = "neobert"

    # All config parameters must have a default value.
    def __init__(
        self,
        hidden_size: int = 768,
        num_hidden_layers: int = 28,
        num_attention_heads: int = 12,
        intermediate_size: int = 3072,
        embedding_init_range: float = 0.02,
        encoder_init_range: float = 0.02,
        norm_eps: float = 1e-06,
        vocab_size: int = 30522,
        pad_token_id: int = 0,
        max_length: int = 1024,
        **kwargs,
    ):
        super().__init__(**kwargs)

        self.hidden_size = hidden_size
        self.num_hidden_layers = num_hidden_layers
        self.num_attention_heads = num_attention_heads
        if hidden_size % num_attention_heads != 0:
            raise ValueError("Hidden size must be divisible by the number of heads.")
        self.dim_head = hidden_size // num_attention_heads
        self.intermediate_size = intermediate_size
        self.embedding_init_range = embedding_init_range
        self.encoder_init_range = encoder_init_range
        self.norm_eps = norm_eps
        self.vocab_size = vocab_size
        self.pad_token_id = pad_token_id
        self.max_length = max_length
        self.kwargs = kwargs


class EncoderBlock(nn.Module):
    """Transformer encoder block."""

    def __init__(self, config: NeoBERTConfig):
        super().__init__()

        self.config = config

        # Attention
        self.qkv = nn.Linear(in_features=config.hidden_size, out_features=config.hidden_size * 3, bias=False)
        self.wo = nn.Linear(in_features=config.hidden_size, out_features=config.hidden_size, bias=False)

        # Feedforward network
        # Original NeoBERT:
        # multiple_of = 8
        # intermediate_size = int(2 * config.intermediate_size / 3)
        # intermediate_size = multiple_of * ((intermediate_size + multiple_of - 1) // multiple_of)
        intermediate_size = config.intermediate_size
        self.ffn = SwiGLU(config.hidden_size, intermediate_size, config.hidden_size, bias=False)

        # Layer norms
        rms_norm_cls = nn.RMSNorm if config._attn_implementation != 'onnx_eager' and hasattr(nn, 'RMSNorm') else NeoBERTEagerRMSNorm
        self.attention_norm = rms_norm_cls(config.hidden_size, config.norm_eps)
        self.ffn_norm = rms_norm_cls(config.hidden_size, config.norm_eps)

    def forward(
        self,
        x: torch.Tensor,
        attention_mask: torch.Tensor,
        freqs_cis: torch.Tensor,
        output_attentions: bool,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
    ):
        # Attention
        attn_output, attn_weights = self._att_block(
            self.attention_norm(x), attention_mask, freqs_cis, output_attentions, max_seqlen, cu_seqlens
        )

        # Residual
        x = x + attn_output

        # Feed-forward
        x = x + self.ffn(self.ffn_norm(x))

        return x, attn_weights

    def _att_block(
        self,
        x: torch.Tensor,
        attention_mask: torch.Tensor,
        freqs_cis: torch.Tensor,
        output_attentions: bool,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
    ):
        batch_size, seq_len, _ = x.shape

        xq, xk, xv = self.qkv(x).view(batch_size, seq_len, self.config.num_attention_heads, self.config.dim_head * 3).chunk(3, axis=-1)

        xq, xk = apply_rotary_emb(xq, xk, freqs_cis)

        # Attn block
        attn_weights = None

        # Flash attention if the tensors are packed
        if cu_seqlens is not None:
            attn = flash_attn_varlen_func(
                q=xq.squeeze(0),
                k=xk.squeeze(0),
                v=xv.squeeze(0),
                cu_seqlens_q=cu_seqlens,
                cu_seqlens_k=cu_seqlens,
                max_seqlen_q=max_seqlen,
                max_seqlen_k=max_seqlen,
                dropout_p=0.0,
                causal=False,
            )
        # Eager attention if attention weights are needed in the output (avoid using this unless needed - e.g., for onnx export)
        elif output_attentions or self.config._attn_implementation == 'onnx_eager':
            attn_weights = xq.permute(0, 2, 1, 3) @ xk.permute(0, 2, 3, 1) / (xq.size(-1) ** 0.5)
            if attention_mask is not None:
               attn_weights = attn_weights * attention_mask
            attn_weights = attn_weights.softmax(-1)
            attn = attn_weights @ xv.permute(0, 2, 1, 3)
            attn = attn.transpose(1, 2)
        # Fall back to SDPA otherwise
        else:
            attn = scaled_dot_product_attention(
                query=xq.transpose(1, 2),
                key=xk.transpose(1, 2),
                value=xv.transpose(1, 2),
                attn_mask=attention_mask.bool(),
                dropout_p=0,
            ).transpose(1, 2)

        return self.wo(attn.reshape(batch_size, seq_len, self.config.num_attention_heads * self.config.dim_head)), attn_weights


class NeoBERTPreTrainedModel(PreTrainedModel):
    config_class = NeoBERTConfig
    base_model_prefix = "model"
    _supports_cache_class = True

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            module.weight.data.uniform_(-self.config.encoder_init_range, self.config.encoder_init_range)
        elif isinstance(module, nn.Embedding):
            module.weight.data.uniform_(-self.config.embedding_init_range, self.config.embedding_init_range)


class NeoBERT(NeoBERTPreTrainedModel):
    config_class = NeoBERTConfig

    def __init__(self, config: NeoBERTConfig):
        super().__init__(config)

        self.config = config

        self.encoder = nn.Embedding(config.vocab_size, config.hidden_size, padding_idx=config.pad_token_id)

        # Ensures freqs_cis is moved to the same devices as the model. Non-persistent buffers are not saved in the state_dict.
        cos, sin = precompute_freqs(config.hidden_size // config.num_attention_heads, config.max_length)
        self.register_buffer("freqs_cos", cos, persistent=False)
        self.register_buffer("freqs_sin", sin, persistent=False)

        self.transformer_encoder = nn.ModuleList()
        for _ in range(config.num_hidden_layers):
            self.transformer_encoder.append(EncoderBlock(config))

        rms_norm_cls = nn.RMSNorm if config._attn_implementation != 'onnx_eager' and hasattr(nn, 'RMSNorm') else NeoBERTEagerRMSNorm
        self.layer_norm = rms_norm_cls(config.hidden_size, config.norm_eps)

        # Initialize weights and apply final processing
        self.post_init()

    def forward(
        self,
        input_ids: Optional[torch.Tensor] = None,
        position_ids: torch.Tensor = None,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
        attention_mask: torch.Tensor = None,
        inputs_embeds: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None, # kept in to not break compatibility with tokenizer(...), ignored
        output_hidden_states: bool = False,
        output_attentions: bool = False,
        **kwargs,
    ):
        # Initialize
        hidden_states, attentions = [], []

        if (input_ids is None) ^ (inputs_embeds is not None):
            raise ValueError("You must specify exactly one of input_ids or inputs_embeds")

        # Expand and repeat: (Batch, Length) -> (Batch, Heads, Length, Length)
        if attention_mask is None:
            attention_mask = torch.ones_like(input_ids)
        attention_mask = attention_mask[:, None, None, :]
            
            # attention_mask = attention_mask.unsqueeze(1).unsqueeze(1).repeat(1, self.config.num_attention_heads, attention_mask.size(-1), 1)

        # Checks to be done if inputs are packed sequences
        if cu_seqlens is not None:
            assert (
                FLASH_ATTN_AVAILABLE
            ), "Flash-attention is not available. Please ''pip install flash_attn'', or provide un-packed sequences."
            assert not output_attentions, "Output attentions is not supported when sequences are packed."
            assert max_seqlen is not None, "Missing max_seqlen. It must be provided when cu_seqlens are not None."
            assert (input_ids if input_ids is not None else inputs_embeds).shape[
                0
            ] == 1, "Cumulative sequence lengths are provided but inputs are not packed."
            assert (
                input_ids if input_ids is not None else inputs_embeds
            ).is_cuda, "Packing uses an implementation of flash-attention and is only supported on GPU."

        # RoPE
        if position_ids is not None:
            freqs = (self.freqs_cos[position_ids], self.freqs_sin[position_ids])
        else:
            L = (input_ids if input_ids is not None else inputs_embeds).shape[1]
            freqs = (self.freqs_cos[:L], self.freqs_sin[:L])

        # Embedding
        x = self.encoder(input_ids) if input_ids is not None else inputs_embeds

        # Transformer encoder
        for layer in self.transformer_encoder:
            x, attn = layer(x, attention_mask, freqs, output_attentions, max_seqlen, cu_seqlens)
            if output_hidden_states:
                hidden_states.append(x)
            if output_attentions:
                attentions.append(attn)

        # Final normalization layer
        x = self.layer_norm(x)

        # Return the output of the last hidden layer
        return BaseModelOutput(
            last_hidden_state=x,
            hidden_states=hidden_states if output_hidden_states else None,
            attentions=attentions if output_attentions else None,
        )


class NeoBERTLMHead(NeoBERTPreTrainedModel):
    config_class = NeoBERTConfig

    def __init__(self, config: NeoBERTConfig):
        super().__init__(config)

        self.config = config

        self.model = NeoBERT(config)
        self.decoder = nn.Linear(config.hidden_size, config.vocab_size)

        self.post_init()

    def forward(
        self,
        input_ids: torch.Tensor,
        position_ids: torch.Tensor = None,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
        attention_mask: torch.Tensor = None,
        inputs_embeds: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None, # kept in to not break compatibility with tokenizer(...), ignored
        output_hidden_states: bool = False,
        output_attentions: bool = False,
        **kwargs,
    ):

        output = self.model.forward(
            input_ids=input_ids,
            position_ids=position_ids,
            inputs_embeds=inputs_embeds,
            max_seqlen=max_seqlen,
            cu_seqlens=cu_seqlens,
            attention_mask=attention_mask,
            output_hidden_states=output_hidden_states,
            output_attentions=output_attentions,
        )
        logits = self.decoder(output.last_hidden_state)

        return MaskedLMOutput(
            hidden_states=output.hidden_states if output_hidden_states else None,
            attentions=output.attentions if output_attentions else None,
            logits=logits,
        )


class NeoBERTForTokenClassification(NeoBERTPreTrainedModel):
    config_class = NeoBERTConfig

    def __init__(self, config: NeoBERTConfig):
        super().__init__(config)

        self.config = config

        self.num_labels = getattr(config, "num_labels", 2)
        self.classifier_dropout = getattr(config, "classifier_dropout", 0.1)
        self.classifier_init_range = getattr(config, "classifier_init_range", 0.02)

        self.model = NeoBERT(config)

        self.dense = nn.Linear(self.config.hidden_size, self.config.hidden_size)
        self.dropout = nn.Dropout(self.classifier_dropout)
        self.classifier = nn.Linear(self.config.hidden_size, self.num_labels)

        self.post_init()

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            module.weight.data.normal_(mean=0.0, std=self.classifier_init_range)
            if module.bias is not None:
                module.bias.data.zero_()

    def forward(
        self,
        input_ids: Optional[torch.Tensor] = None,
        position_ids: torch.Tensor = None,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
        attention_mask: torch.Tensor = None,
        inputs_embeds: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None, # kept in to not break compatibility with tokenizer(...), ignored
        output_hidden_states: bool = False,
        output_attentions: bool = False,
        labels: Optional[torch.Tensor] = None,
        return_dict: Optional[bool] = None,
    ):
        return_dict = return_dict if return_dict is not None else self.config.use_return_dict
        
        output = self.model.forward(
            input_ids=input_ids,
            position_ids=position_ids,
            inputs_embeds=inputs_embeds,
            max_seqlen=max_seqlen,
            cu_seqlens=cu_seqlens,
            attention_mask=attention_mask,
            output_hidden_states=output_hidden_states,
            output_attentions=output_attentions,
        )
        hidden_states = output.last_hidden_state

        x = self.dropout(hidden_states)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)

        logits = self.classifier(x)

        loss = None
        if labels is not None:
            loss_fct = CrossEntropyLoss()
            # only keep active parts of the loss
            if attention_mask is not None:
                active_loss = attention_mask.view(-1) == 1
                active_logits = logits.view(-1, self.num_labels)[active_loss]
                active_labels = labels.view(-1)[active_loss]
                loss = loss_fct(active_logits, active_labels)
            else:
                loss = loss_fct(logits.view(-1, self.num_labels), labels.view(-1))

        if not return_dict:
            result = (logits,)
            return ((loss,) + result) if loss is not None else result

        return TokenClassifierOutput(
            loss=loss,
            logits=logits,
            hidden_states=output.hidden_states if output_hidden_states else None,
            attentions=output.attentions if output_attentions else None,
        )


class NeoBERTForSequenceClassification(NeoBERTPreTrainedModel):
    config_class = NeoBERTConfig

    def __init__(self, config: NeoBERTConfig):
        super().__init__(config)

        self.config = config

        self.num_labels = getattr(config, "num_labels", 2)
        self.classifier_dropout = getattr(config, "classifier_dropout", 0.1)
        self.classifier_init_range = getattr(config, "classifier_init_range", 0.02)

        self.model = NeoBERT(config)

        self.dense = nn.Linear(self.config.hidden_size, self.config.hidden_size)
        self.dropout = nn.Dropout(self.classifier_dropout)
        self.classifier = nn.Linear(self.config.hidden_size, self.num_labels)

        self.post_init()

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            module.weight.data.normal_(mean=0.0, std=self.classifier_init_range)
            if module.bias is not None:
                module.bias.data.zero_()

    def forward(
        self,
        input_ids: Optional[torch.Tensor] = None,
        position_ids: torch.Tensor = None,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
        attention_mask: torch.Tensor = None,
        inputs_embeds: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None, # kept in to not break compatibility with tokenizer(...), ignored
        output_hidden_states: bool = False,
        output_attentions: bool = False,
        labels: Optional[torch.Tensor] = None,
        return_dict: Optional[bool] = None,
    ):
        return_dict = return_dict if return_dict is not None else self.config.use_return_dict
        
        output = self.model.forward(
            input_ids=input_ids,
            position_ids=position_ids,
            inputs_embeds=inputs_embeds,
            max_seqlen=max_seqlen,
            cu_seqlens=cu_seqlens,
            attention_mask=attention_mask,
            output_hidden_states=output_hidden_states,
            output_attentions=output_attentions,
        )
        hidden_states = output.last_hidden_state

        x = hidden_states[:, 0, :]
        x = self.dropout(x)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)

        logits = self.classifier(x)

        loss = None
        if labels is not None:
            if self.config.problem_type is None:
                if self.num_labels == 1:
                    self.config.problem_type = "regression"
                elif self.num_labels > 1 and (labels.dtype == torch.long or labels.dtype == torch.int):
                    self.config.problem_type = "single_label_classification"
                else:
                    self.config.problem_type = "multi_label_classification"

            if self.config.problem_type == "regression":
                loss_fct = MSELoss()
                if self.num_labels == 1:
                    loss = loss_fct(logits.squeeze(), labels.squeeze())
                else:
                    loss = loss_fct(logits, labels)
            elif self.config.problem_type == "single_label_classification":
                loss_fct = CrossEntropyLoss()
                loss = loss_fct(logits.view(-1, self.num_labels), labels.view(-1))
            elif self.config.problem_type == "multi_label_classification":
                loss_fct = BCEWithLogitsLoss()
                loss = loss_fct(logits, labels)

        if not return_dict:
            result = (logits,)
            return ((loss,) + result) if loss is not None else result

        return SequenceClassifierOutput(
            loss=loss,
            logits=logits,
            hidden_states=output.hidden_states if output_hidden_states else None,
            attentions=output.attentions if output_attentions else None,
        )

class NeoBERTForQuestionAnswering(NeoBERTPreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.num_labels = config.num_labels

        self.model = NeoBERT(config)
        self.qa_outputs = nn.Linear(config.hidden_size, config.num_labels)

        # Initialize weights and apply final processing
        self.post_init()

    def forward(
        self,
        input_ids: Optional[torch.Tensor] = None,
        position_ids: torch.Tensor = None,
        max_seqlen: int = None,
        cu_seqlens: torch.Tensor = None,
        attention_mask: torch.Tensor = None,
        inputs_embeds: Optional[torch.Tensor] = None,
        token_type_ids: Optional[torch.Tensor] = None, # kept in to not break compatibility with tokenizer(...), ignored
        start_positions: Optional[torch.Tensor] = None,
        end_positions: Optional[torch.Tensor] = None,
        output_hidden_states: bool = False,
        output_attentions: bool = False,
        return_dict: Optional[bool] = None,
    ) -> Union[tuple[torch.Tensor], QuestionAnsweringModelOutput]:
        return_dict = return_dict if return_dict is not None else self.config.use_return_dict
        if output_attentions or output_hidden_states: return_dict = True

        output = self.model.forward(
            input_ids=input_ids,
            position_ids=position_ids,
            inputs_embeds=inputs_embeds,
            max_seqlen=max_seqlen,
            cu_seqlens=cu_seqlens,
            attention_mask=attention_mask,
            output_hidden_states=output_hidden_states,
            output_attentions=output_attentions,
            return_dict=True
        )
        hidden_states = output.last_hidden_state

        logits = self.qa_outputs(hidden_states)
        start_logits, end_logits = logits.split(1, dim=-1)
        start_logits = start_logits.squeeze(-1).contiguous()
        end_logits = end_logits.squeeze(-1).contiguous()

        total_loss = None
        if start_positions is not None and end_positions is not None:
            # If we are on multi-GPU, split add a dimension
            if len(start_positions.size()) > 1:
                start_positions = start_positions.squeeze(-1)
            if len(end_positions.size()) > 1:
                end_positions = end_positions.squeeze(-1)
            # sometimes the start/end positions are outside our model inputs, we ignore these terms
            ignored_index = start_logits.size(1)
            start_positions = start_positions.clamp(0, ignored_index)
            end_positions = end_positions.clamp(0, ignored_index)

            loss_fct = CrossEntropyLoss(ignore_index=ignored_index)
            start_loss = loss_fct(start_logits, start_positions)
            end_loss = loss_fct(end_logits, end_positions)
            total_loss = (start_loss + end_loss) / 2

        if not return_dict:
            output = (start_logits, end_logits)
            return ((total_loss,) + output) if total_loss is not None else output

        return QuestionAnsweringModelOutput(
            loss=total_loss,
            start_logits=start_logits,
            end_logits=end_logits,
            hidden_states=output.hidden_states,
            attentions=output.attentions,
        )