import React from "react";
import { LiquidButton } from "@/components/ui/liquid-glass-button";

export default function LiquidGlassDemo() {
  return (
    <div className="relative flex h-[200px] w-full items-center justify-center p-8 bg-[#07080e] rounded-2xl border border-white/10">
      <LiquidButton className="px-8 py-3 text-base">
        Liquid Glass
      </LiquidButton>
    </div>
  );
}
