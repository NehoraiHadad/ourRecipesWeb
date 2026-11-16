"""Nativ (נתיב): a Hebrew encoder (dicta-il/neodictabert) that reads the state, the question and all the options
in one forward pass and gives each option a probability. Each option is scored from the [CLS] vector and the
mean of the option's tokens. Used both for training and for inference.

    from decider import HebrewDecider
    nativ = HebrewDecider.from_pretrained("path/to/nativ-he-decision")
    nativ.decide("שלום, אפשר לחזור אליי מחר בבוקר?", "האם הטקסט מכיל מידע מזהה אישי?", ["כן", "לא"])
    # [p(כן), p(לא)]
"""
import json
import sys
from pathlib import Path

import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

ENCODER_NAME = "dicta-il/neodictabert"
MAX_INPUT_TOKENS = 1024  # longer states are cut; the question and the options always fit
MAX_OPTION_TOKENS = 64


def load_encoder(encoder_name):
    # fp32 on purpose: NeoBERT's config pins bfloat16, and bf16 on CPU is ~8x slower
    encoder = AutoModel.from_pretrained(encoder_name, trust_remote_code=True, dtype=torch.float32)
    # NeoBERT keeps its RoPE tables as non-persistent buffers; transformers 5 builds the model on the meta device,
    # so they come back uninitialised and every output is NaN. Recompute them.
    if hasattr(encoder, "freqs_cos"):
        precompute_rope_tables = sys.modules[type(encoder).__module__].precompute_freqs
        config = encoder.config
        encoder.freqs_cos, encoder.freqs_sin = precompute_rope_tables(
            config.hidden_size // config.num_attention_heads, config.max_length,
        )
    return encoder.float()


class StudentModel(nn.Module):
    def __init__(self, encoder):
        super().__init__()
        self.encoder = encoder
        hidden_size = encoder.config.hidden_size
        self.option_scorer = nn.Sequential(
            nn.Linear(2 * hidden_size, hidden_size), nn.GELU(), nn.Linear(hidden_size, 1),
        )

    def forward(self, input_ids, attention_mask, option_spans):
        hidden_states = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        option_features, positions = [], []
        for row_index, spans in enumerate(option_spans):
            for option_index, (start, end) in enumerate(spans):
                option_features.append(torch.cat([hidden_states[row_index, 0], hidden_states[row_index, start:end].mean(dim=0)]))
                positions.append((row_index, option_index))
        scores = self.option_scorer(torch.stack(option_features)).squeeze(-1).float()
        rows = torch.tensor([row for row, _ in positions], device=scores.device)
        columns = torch.tensor([column for _, column in positions], device=scores.device)
        max_options = max(len(spans) for spans in option_spans)
        logits = torch.full((len(option_spans), max_options), float("-inf"), device=scores.device)
        return logits.index_put((rows, columns), scores)


def encode_example(tokenizer, example):
    """[CLS] state [SEP] question [SEP] option [SEP] option [SEP] ... and each option's token span.
    Only the state is truncated, so every option always fits."""
    def token_ids(text, limit=None):
        ids = tokenizer(text, add_special_tokens=False).input_ids
        return ids[:limit] if limit else ids

    question_ids = token_ids(example["question"])
    option_ids = [token_ids(option, MAX_OPTION_TOKENS) or [tokenizer.unk_token_id] for option in example["options"]]
    fixed_length = 3 + len(question_ids) + sum(len(ids) + 1 for ids in option_ids)
    state_ids = token_ids(example["state"])[:max(0, MAX_INPUT_TOKENS - fixed_length)]
    input_ids = [tokenizer.cls_token_id] + state_ids + [tokenizer.sep_token_id] + question_ids + [tokenizer.sep_token_id]
    option_spans = []
    for ids in option_ids:
        option_spans.append((len(input_ids), len(input_ids) + len(ids)))
        input_ids += ids + [tokenizer.sep_token_id]
    return {**example, "input_ids": input_ids, "option_spans": option_spans, "prompt_tokens": len(input_ids)}


def collate(tokenizer, encoded_examples, device):
    longest = max(len(example["input_ids"]) for example in encoded_examples)
    input_ids = torch.full((len(encoded_examples), longest), tokenizer.pad_token_id)
    attention_mask = torch.zeros((len(encoded_examples), longest), dtype=torch.long)
    for row_index, example in enumerate(encoded_examples):
        input_ids[row_index, :len(example["input_ids"])] = torch.tensor(example["input_ids"])
        attention_mask[row_index, :len(example["input_ids"])] = 1
    return input_ids.to(device), attention_mask.to(device), [example["option_spans"] for example in encoded_examples]


class HebrewDecider:
    """Released model: weights in model.safetensors next to config.json and the tokenizer files."""

    def __init__(self, model, tokenizer, device="cpu"):
        self.model, self.tokenizer, self.device = model.to(device).eval(), tokenizer, device

    @classmethod
    def from_pretrained(cls, directory, device="cpu"):
        from safetensors.torch import load_file

        directory = Path(directory)
        config = json.loads((directory / "config.json").read_text())
        model = StudentModel(load_encoder(config["encoder"]))
        model.load_state_dict({name: tensor.float() for name, tensor in load_file(directory / "model.safetensors").items()})
        return cls(model, AutoTokenizer.from_pretrained(directory, trust_remote_code=True), device)

    @torch.no_grad()
    def decide_many(self, decisions):
        """decisions: dicts with state, question, options. Returns one probability list per decision."""
        encoded = [encode_example(self.tokenizer, decision) for decision in decisions]
        logits = self.model(*collate(self.tokenizer, encoded, self.device))
        return [row[:len(decision["options"])].tolist() for row, decision in zip(torch.softmax(logits, dim=-1), decisions)]

    def decide(self, state, question, options):
        return self.decide_many([{"state": state, "question": question, "options": list(options)}])[0]
