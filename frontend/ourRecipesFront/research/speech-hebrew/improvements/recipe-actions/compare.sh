#!/usr/bin/env bash
set -eu
# Run from this directory after preparing the corpus. Preserve past results.
out=${ASR_TRIAL_OUTPUT:-$PWD}
corpus=$1
input_dir=$2
case "$corpus" in holdout|control|challenge) ;; *) exit 2 ;; esac
cp -n "$input_dir/manifest.json" "$out/$corpus-manifest.json"
cmp "$input_dir/manifest.json" "$out/$corpus-manifest.json"
export SPEECH_RECIPE_HINTS=1 SPEECH_NEW_CACHE="$input_dir" SPEECH_MANIFEST="$input_dir/manifest.json"
SPEECH_HINT_ARM=hints-salad SPEECH_RESULT="$out/$corpus-baseline.json" node ../fresh/run.mjs
SPEECH_HINT_ARM=hints-cookies SPEECH_RESULT="$out/$corpus-actions.json" node ../fresh/run.mjs
