---
license: cc-by-4.0
language:
- he
---
# DictaBERT-Tiny: A State-of-the-Art BERT-Large Suite for Modern Hebrew

State-of-the-art language model for Hebrew, released [here](https://arxiv.org/abs/2308.16687).

This is the BERT-tiny base model pretrained with the masked-language-modeling objective. 

For the bert models for other tasks, see [here](https://huggingface.co/collections/dicta-il/dictabert-6588e7cc08f83845fc42a18b).

Sample usage:

```python
from transformers import AutoModelForMaskedLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained('dicta-il/dictabert-tiny')
model = AutoModelForMaskedLM.from_pretrained('dicta-il/dictabert-tiny')

model.eval()

sentence = 'בשנת 1948 השלים אפרים קישון את [MASK] בפיסול מתכת ובתולדות האמנות והחל לפרסם מאמרים הומוריסטיים'

output = model(tokenizer.encode(sentence, return_tensors='pt'))
# the [MASK] is the 7th token (including [CLS])
import torch
top_2 = torch.topk(output.logits[0, 7, :], 2)[1]
print('\n'.join(tokenizer.convert_ids_to_tokens(top_2))) # should print עבודתו / התמחותו 

```


## Citation

If you use DictaBERT in your research, please cite ```DictaBERT: A State-of-the-Art BERT Suite for Modern Hebrew```

**BibTeX:**

```bibtex
@misc{shmidman2023dictabert,
      title={DictaBERT: A State-of-the-Art BERT Suite for Modern Hebrew}, 
      author={Shaltiel Shmidman and Avi Shmidman and Moshe Koppel},
      year={2023},
      eprint={2308.16687},
      archivePrefix={arXiv},
      primaryClass={cs.CL}
}
```

## License

Shield: [![CC BY 4.0][cc-by-shield]][cc-by]

This work is licensed under a
[Creative Commons Attribution 4.0 International License][cc-by].

[![CC BY 4.0][cc-by-image]][cc-by]

[cc-by]: http://creativecommons.org/licenses/by/4.0/
[cc-by-image]: https://i.creativecommons.org/l/by/4.0/88x31.png
[cc-by-shield]: https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg
