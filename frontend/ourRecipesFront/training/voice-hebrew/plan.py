"""Offline cost/resource plan. No Modal import or account/network access."""
import json
from corpus import ROOT
from engine import verify_manifest

def plan(data=ROOT/"data"):
    manifest=verify_manifest(data)
    hourly=.000164*3600+2*.0000131*3600+8*.00000222*3600
    return {"provider":"Modal","gpu":"T4","cpu_physical_cores":2,"ram_gib":8,
            "max_training_seconds":600,"provider_attempt_timeout_seconds":900,"automatic_retries":0,"max_containers":1,
            "nominal_resource_cost_usd_per_hour":hourly,"nominal_15_minute_resource_estimate_usd":hourly/4,
            "price_snapshot":"2026-11-11","corpus_sha256":manifest["corpus_sha256"],"data_origin":manifest["origin"],
            "note":"Resource calculation, not a quote or billing cap; includes requested CPU/RAM, excludes other workspace usage/storage/egress. Set provider Workspace budget and net spend limit before launch. No cloud request is made by this command."}
if __name__=="__main__":print(json.dumps(plan(),ensure_ascii=False,indent=2))
