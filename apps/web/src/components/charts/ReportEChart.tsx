import { useEffect, useRef } from 'react';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import type { EChartsCoreOption } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
]);

export type ReportChartClick = (data: unknown) => void;

export function ReportEChart({
  ariaLabel,
  className = 'h-80 w-full',
  onDataClick,
  option,
}: {
  ariaLabel: string;
  className?: string;
  onDataClick?: ReportChartClick;
  option: EChartsCoreOption;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.EChartsType | null>(null);
  const clickRef = useRef(onDataClick);

  useEffect(() => {
    clickRef.current = onDataClick;
  }, [onDataClick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = echarts.init(container, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    const click = (params: { data?: unknown }) => clickRef.current?.(params.data);
    chart.on('click', click);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize());
    observer?.observe(container);
    const resize = () => chart.resize();
    if (!observer) window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', resize);
      chart.off('click', click);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    chartRef.current?.setOption(
      { ...option, animation: !reducedMotion, animationDuration: reducedMotion ? 0 : 250 },
      { notMerge: true },
    );
  }, [option]);

  return (
    <div aria-label={ariaLabel} role="img">
      <div className={className} ref={containerRef} />
    </div>
  );
}
