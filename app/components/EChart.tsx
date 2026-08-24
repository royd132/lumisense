"use client";

import type { EChartsOption } from "echarts";
import { useEffect, useRef } from "react";

export default function EChart({ option, className = "", label }: { option: EChartsOption; className?: string; label: string }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chart: import("echarts").ECharts | undefined;
    let disposed = false;
    const resize = () => chart?.resize();
    void import("echarts").then((echarts) => {
      if (disposed || !chartRef.current) return;
      chart = echarts.init(chartRef.current);
      chart.setOption(option);
      window.addEventListener("resize", resize);
    });
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [option]);

  return <div ref={chartRef} className={`echart ${className}`} role="img" aria-label={label} />;
}
