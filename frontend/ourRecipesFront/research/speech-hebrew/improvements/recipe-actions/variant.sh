#!/usr/bin/env bash
set -eu
out=${ASR_TRIAL_OUTPUT:-$PWD}
corpus=$1
source_dir=$2
hint_file=$3
work_dir=$4
variant=${5:-negated}
case "$variant" in negated|weighted) ;; *) exit 2 ;; esac
case "$corpus" in holdout|control|challenge) ;; *) exit 2 ;; esac
mkdir "$work_dir"
for file in "$source_dir"/*.pcm "$source_dir"/{manifest.json,bpe.vocab,salad.txt}; do
  ln -s "$(realpath "$file")" "$work_dir/"
done
cp "$hint_file" "$work_dir/cookies.txt"
SPEECH_RECIPE_HINTS=1 SPEECH_HINT_ARM=hints-cookies SPEECH_NEW_CACHE="$work_dir" \
  SPEECH_MANIFEST="$work_dir/manifest.json" SPEECH_RESULT="$out/$corpus-$variant.json" node ../fresh/run.mjs
