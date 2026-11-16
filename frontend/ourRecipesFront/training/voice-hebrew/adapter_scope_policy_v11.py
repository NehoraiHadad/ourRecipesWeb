"""Fixed endpoint, both cached anchors must pass; no promotion decision."""
from sparse_recipe_study_v4 import decision


def decisions(replay, native, candidate):
    comparisons = {}
    for name, anchor in [('replay_v5', replay), ('native_v10', native)]:
        result = decision(anchor, candidate)
        result['adapter_scope_gate_passed'] = result.pop('data_intervention_gate_passed')
        comparisons[name] = result
    return {'primary_endpoint_step': 160, 'comparisons': comparisons,
            'adapter_scope_gate_passed': all(c['adapter_scope_gate_passed'] for c in comparisons.values()),
            'product_promotion': False}
