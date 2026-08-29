"use client";
import { useSyncExternalStore } from "react";
import type { AutoDjController, AutoDjSnapshot } from "@/lib/autodj";

export function useAutoDjSnapshot(controller: AutoDjController): AutoDjSnapshot {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getSnapshot(),
    () => controller.getSnapshot()
  );
}
