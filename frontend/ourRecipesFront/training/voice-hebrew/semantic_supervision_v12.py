"""Common task encoding, exposure schedule and scoring for semantic supervision."""
import argparse
from collections import Counter
import json
from pathlib import Path

import adapter_scope_sft_v11 as reference
from semantic_supervision_data_v12 import ROOT
from sparse_recipe_data_v4 import messages

PLAN = ROOT / 'verification/semantic-supervision-plan-v12-20261118.json'
MANIFEST = ROOT / 'verification/semantic-supervision-freeze-v12-20261118.json'
ARMS = ('primary_replay', 'semantic')
AUX_SYSTEM = """במשימת B, פרק הודעת בישול בעברית לפי המתכון וההיסטוריה שבבקשה. החזר JSON בלבד: intent ו-clauses.
intent הוא report, next, missed, quantity, explain, clarify או other.
לכל פסוקית רלוונטית החזר action (מזהה מהמתכון או null), stance ו-evidence (מקטע רציף מההודעה).
stance: asserted=דיווח ודאי; uncertain=ספק לא פתור; plan=תוכנית; quoted=ציטוט כדוגמה; hypothetical=תרחיש דמיוני; superseded=דיווח או ספק שתוקנו; outside_recipe=עניין צדדי.
רק עם asserted החזר גם status: done, pending או partial. דיווח ודאי עם כינוי לא פתור יכול לשאת action=null.
פרק כמה פסוקיות לפי סדרן. פתור כינוי לפי ההיסטוריה של המתכון הנוכחי בלבד, בלי להיעזר במיקום הניווט.
אם אין פסוקית על ביצוע או תוכנית, אפשר להחזיר clauses ריקה."""


def read_plan():
    return json.loads(PLAN.read_text())


def verify_freeze():
    manifest = json.loads(MANIFEST.read_text())
    if PLAN.relative_to(ROOT).as_posix() not in manifest['sha256']:
        raise ValueError('Freeze does not include the protocol')
    for name, expected in manifest['sha256'].items():
        if reference.digest(ROOT / name) != expected:
            raise ValueError(f'Frozen input mismatch: {name}')


def load_tokenizer(folder, plan):
    from transformers import AutoTokenizer

    for name, expected in plan['tokenizer_sha256'].items():
        if reference.digest(folder / name) != expected:
            raise ValueError(f'Tokenizer integrity failure: {name}')
    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.pad_token or tokenizer.eos_token
    tokenizer.padding_side = 'left'
    return tokenizer


def task_messages(row, arm):
    system, user = messages(row)
    marker = {'primary_replay': 'A', 'semantic': 'B'}[arm]
    instruction = f"מלא רק את המשימה שנבחרה בסוף ההנחיות.\nמשימת A\n{system['content']}\n{AUX_SYSTEM}\nTask {marker}"
    return [{'role': 'system', 'content': instruction}, user]


def encode_second_task(tokenizer, row, target, limit, arm):
    conversation = task_messages(row, arm)
    options = {'tokenize': True, 'enable_thinking': False}
    prefix = tokenizer.apply_chat_template(conversation, add_generation_prompt=True, **options)
    answer = json.dumps(target, ensure_ascii=False, separators=(',', ':'))
    full = tokenizer.apply_chat_template(conversation + [{'role': 'assistant', 'content': answer}],
                                         add_generation_prompt=False, **options)
    if full[:len(prefix)] != prefix:
        raise ValueError('Auxiliary training and generation prefixes differ')
    end = full.index(tokenizer.eos_token_id, len(prefix))
    if not len(prefix) < end < limit:
        raise ValueError(f'Empty or overlong auxiliary target for {row["id"]}')
    full = full[:end + 1]
    return {'input_ids': full, 'labels': [-100] * len(prefix) + full[len(prefix):],
            'prompt_tokens': len(prefix), 'target_tokens': len(full) - len(prefix)}


def encode_train(tokenizer, rows, labels, limit):
    label_by_id = {label['id']: label['target'] for label in labels}
    primary = [reference.encode(tokenizer, row, limit) for row in rows]
    replay, auxiliary = {}, {}
    for i, row in enumerate(rows):
        if row['id'] in label_by_id:
            replay[i] = encode_second_task(tokenizer, row, row['expected'], limit, 'primary_replay')
            auxiliary[i] = encode_second_task(tokenizer, row, label_by_id[row['id']], limit, 'semantic')
    return primary, replay, auxiliary


def exposure(plan, train_size):
    training = plan['training']
    count = training['updates'] * training['micro_batch'] * training['accumulation']
    return reference.load_schedule(ROOT / training['schedule_file'], training['schedule_sha256'], train_size, count)


def batches(order, width):
    for start in range(0, len(order), width):
        yield order[start:start + width]


def token_summary(primary, extra, order):
    def summarize(encoded):
        lengths = [len(row['input_ids']) for row in encoded]
        targets = [row['target_tokens'] for row in encoded]
        return {'records': len(lengths), 'input_tokens': sum(lengths), 'max_input': max(lengths),
                'target_tokens': sum(targets), 'max_target': max(targets)}

    return {'primary': summarize([primary[i] for i in order]),
            'second_task': summarize([extra[i] for i in order if i in extra])}


def assert_encoding(tokenizer, encoded, conversation, target, limit):
    prefix = tokenizer.apply_chat_template(conversation, tokenize=True, add_generation_prompt=True,
                                           enable_thinking=False)
    tokens = encoded['input_ids']
    tail = tokens[len(prefix):]
    if not len(tokens) <= limit or tokens[:len(prefix)] != prefix:
        raise ValueError('Context or prefix mismatch')
    if encoded['labels'] != [-100] * len(prefix) + tail:
        raise ValueError('Prompt or answer masking mismatch')
    if encoded['prompt_tokens'] != len(prefix) or encoded['target_tokens'] != len(tail):
        raise ValueError('Recorded token count mismatch')
    if not tail or tail[-1] != tokenizer.eos_token_id or tokenizer.eos_token_id in tail[:-1]:
        raise ValueError('The response must end with exactly one supervised EOS')
    if json.loads(tokenizer.decode(tail[:-1], skip_special_tokens=False)) != target:
        raise ValueError('Supervised target fails JSON round-trip')


def preflight(tokenizer, plan, splits, labels):
    from semantic_supervision_data_v12 import audit

    editorial = audit(splits, labels)
    limit = plan['max_sequence_tokens']
    primary, replay, semantic = encode_train(tokenizer, splits['train'], labels, limit)
    evaluated = {}
    for group, rows in splits.items():
        for i, row in enumerate(rows):
            encoded = primary[i] if group == 'train' else reference.encode(tokenizer, row, limit)
            assert_encoding(tokenizer, encoded, messages(row), row['expected'], limit)
            if group != 'train':
                evaluated.setdefault(group, []).append(encoded['prompt_tokens'])
    label_by_id = {label['id']: label['target'] for label in labels}
    for i, encoded in semantic.items():
        row = splits['train'][i]
        assert_encoding(tokenizer, replay[i], task_messages(row, 'primary_replay'), row['expected'], limit)
        assert_encoding(tokenizer, encoded, task_messages(row, 'semantic'), label_by_id[row['id']], limit)
        a = replay[i]['input_ids'][:replay[i]['prompt_tokens']]
        b = encoded['input_ids'][:encoded['prompt_tokens']]
        if len(a) != len(b) or sum(left != right for left, right in zip(a, b)) != 1:
            raise ValueError('Second task prompts must differ by exactly one marker token')
    generation_budget = {group: max(lengths) + plan['evaluation']['max_new_tokens']
                         for group, lengths in evaluated.items()}
    if any(value > limit for value in generation_budget.values()):
        raise ValueError('Evaluation could exceed the context budget')

    order = exposure(plan, len(primary))
    width = plan['training']['micro_batch']
    counts = Counter(order)
    if set(range(len(primary))) != counts.keys():
        raise ValueError('Frozen schedule does not expose every primary TRAIN row')
    if not semantic.keys() <= counts.keys():
        raise ValueError('Frozen schedule omits auxiliary rows')
    return {'editorial_audit': editorial, 'primary_encodings_checked': sum(map(len, splits.values())),
            'auxiliary_encodings_checked': len(semantic), 'replay_encodings_checked': len(replay),
            'second_task_prompts_differ_by_one_marker_token': True,
            'maximum_prompt_plus_generation': generation_budget,
            'train_records': {'primary_replay': token_summary(primary, replay, range(len(primary))),
                              'semantic': token_summary(primary, semantic, range(len(primary)))},
            'scheduled_exposure': {'primary_replay': token_summary(primary, replay, order),
                                   'semantic': token_summary(primary, semantic, order)},
            'microbatches_with_second_task': sum(any(i in semantic for i in indices) for indices in batches(order, width)),
            'scheduled_updates_per_arm': plan['training']['updates'],
            'same_primary_order_and_second_task_row_positions': True,
            'prefix_mask_and_target_round_trip_passed': True,
            'scope': 'CPU tokenizer and editorial audit. No quality inference or production change.'}


def compare_at_endpoint(control, semantic, plan):
    endpoint = plan['training']['updates']
    if control['step'] != endpoint or semantic['step'] != endpoint:
        raise ValueError('The decision must use the frozen final update')
    gate, floors = plan['endpoint_gate'], plan['absolute_gate']
    hard = semantic['primary']
    development, regression = semantic['all_development'], semantic['regression']
    regression_control = control['regression']
    hard_gain = hard['exact'] - control['primary']['exact']
    wrong_fact_delta = {group: semantic[group]['cases_with_wrong_facts'] - control[group]['cases_with_wrong_facts']
                        for group in ('all_development', 'regression')}
    conditions = {
        'hard_exact': hard['exact'] >= gate['hard_exact_min'],
        'hard_gain': hard_gain >= gate['hard_gain_cases_min'],
        'hard_required_changes':
            hard['required_changes_correct'] / max(1, hard['required_changes']) >= gate['correct_required_changes_fraction_min'],
        'development_exact': development['exact'] >= floors['development_exact_min'],
        'development_critical_wrong_facts':
            development['critical_wrong_fact_cases'] <= gate['development_critical_wrong_fact_cases_max'],
        'regression_exact': regression['exact'] >= floors['regression_exact_min'],
        'relative_regression_exact':
            regression_control['exact'] - regression['exact'] <= gate['relative_regression_exact_loss_max'],
        'relative_regression_critical_wrong_facts':
            regression['critical_wrong_fact_cases'] - regression_control['critical_wrong_fact_cases']
            <= gate['relative_regression_critical_wrong_fact_increase_max'],
        'relative_wrong_facts': max(wrong_fact_delta.values())
            <= gate['relative_wrong_fact_case_increase_max_development_and_regression'],
    }
    return {'primary_endpoint_step': endpoint, 'hard_cell_exact_gain_cases': hard_gain,
            'wrong_fact_case_delta': wrong_fact_delta, 'conditions': conditions,
            'semantic_gate_passed': all(conditions.values()), 'product_promotion': False}


if __name__ == '__main__':
    from semantic_supervision_data_v12 import read_labels, read_native

    parser = argparse.ArgumentParser(description='CPU tokenizer and semantic-supervision preflight')
    parser.add_argument('--tokenizer', required=True, type=Path)
    args = parser.parse_args()
    verify_freeze()
    plan = read_plan()
    report = preflight(load_tokenizer(args.tokenizer, plan), plan, read_native(), read_labels())
    print(json.dumps(report, ensure_ascii=False, indent=2))
