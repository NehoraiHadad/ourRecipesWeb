"""V5 has an explicit abstention label; every low-confidence label clarifies."""
import math
from reference_contract import resolve


def route(recipe, state, label, confidence, utterance, threshold):
    abstain = {'intent': 'clarify', 'changes': [], 'requiresReview': True}
    if (not isinstance(confidence, (int, float)) or isinstance(confidence, bool)
            or not math.isfinite(confidence) or not 0 <= confidence <= 1
            or not isinstance(threshold, (int, float)) or isinstance(threshold, bool)
            or not math.isfinite(threshold) or not 0 <= threshold <= 1
            or confidence < threshold):
        return abstain
    if label == 'other':
        return None
    if label == 'clarify':
        return abstain
    result = resolve(recipe, state, {'mode': label, 'confidence': confidence, 'evidence': utterance}, utterance, threshold)
    return {'intent': result['intent'], 'changes': result['changes'], 'requiresReview': True}
