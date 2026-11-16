"""Descriptive single-seed curves; connecting lines are not extra measurements."""
import argparse
import json
from pathlib import Path


def plot(run, audit, target):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    result = json.loads(Path(audit).read_text())
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.5), constrained_layout=True)
    for arm, color in [('control', '#64748b'), ('diverse', '#087f8c')]:
        curve = [json.loads(line) for line in (Path(run) / f'recovered/study/{arm}/training.jsonl').read_text().splitlines()]
        axes[0].plot([r['step'] for r in curve], [r['loss'] for r in curve], color=color, label=arm, linewidth=1)
        steps = result['arms'][arm]['steps']
        for axis, key in [(axes[1], 'primary'), (axes[2], 'regression')]:
            axis.plot([r['step'] for r in steps], [100 * r[key]['exact'] / r[key]['cases'] for r in steps],
                      marker='o', color=color, label=arm)
    axes[0].set(title='Training loss', xlabel='Optimizer update', ylabel='Assistant-token loss')
    axes[1].set(title='New recipe + new frame (40)', xlabel='Measured checkpoint', ylabel='Exact interpretation (%)', ylim=(0, 100), xticks=[0, 80, 160])
    axes[2].set(title='Exposed regression (120)', xlabel='Measured checkpoint', ylabel='Exact interpretation (%)', ylim=(0, 100), xticks=[0, 80, 160])
    for axis in axes:
        axis.grid(alpha=.2); axis.legend(frameon=False)
    fig.suptitle('Qwen3 0.6B: matched data intervention, seed42, authored synthetic text', fontsize=11)
    fig.savefig(target, dpi=160); plt.close(fig)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('run'); p.add_argument('audit'); p.add_argument('output')
    a = p.parse_args()
    if Path(a.output).exists(): raise FileExistsError('Preserve prior plot')
    plot(a.run, a.audit, a.output)
