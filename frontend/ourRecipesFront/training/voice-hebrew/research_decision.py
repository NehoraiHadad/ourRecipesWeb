"""Predeclared validation objective: wrong update cost5, missed update cost1."""
THRESHOLDS=(.3,.5,.7,.9)
MIN_RECALL=.75


def cost(metrics):
    true=metrics['proposed_updates']-metrics['false_updates']
    return 5*metrics['false_updates']+metrics['expected_updates']-true


def key(metrics):
    return (metrics['update_recall']>=MIN_RECALL,-cost(metrics),metrics['update_precision'] or 0,
        metrics['update_recall'],metrics['exact_proposals'],metrics['exact_including_gold_evidence'])


def calibrate(rows,records):
    from span_pilot import grounded
    candidates=[grounded(rows,records,t) for t in THRESHOLDS]
    return max(candidates,key=lambda m:(*key(m),m['threshold']))
