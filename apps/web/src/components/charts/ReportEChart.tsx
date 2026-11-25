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

function syncPrintableSvgViewBox(container: HTMLElement | null): void {
  const svg = container?.querySelector('svg');
  if (!svg) return;
  const widthAttr = Number(svg.getAttribute('width'));
  const heightAttr = Number(svg.getAttribute('height'));
  if (!svg.getAttribute('viewBox') && Number.isFinite(widthAttr) && widthAttr > 0 && Number.isFinite(heightAttr) && heightAttr > 0) {
    svg.setAttribute('viewBox', `0 0 ${widthAttr} ${heightAttr}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}

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

    const resizeForContainer = () => {
      chart.resize();
      syncPrintableSvgViewBox(container);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resizeForContainer) : null;
    observer?.observe(container);

    const printQuery = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    const onPrintEvent = () => {
      syncPrintableSvgViewBox(container);
      window.setTimeout(resizeForContainer, 0);
    };
    window.addEventListener('beforeprint', onPrintEvent);
    window.addEventListener('afterprint', onPrintEvent);
    printQuery?.addEventListener?.('change', onPrintEvent);

    return () => {
      observer?.disconnect();
      window.removeEventListener('beforeprint', onPrintEvent);
      window.removeEventListener('afterprint', onPrintEvent);
      printQuery?.removeEventListener?.('change', onPrintEvent);
      chart.off('click', click);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chartRef.current?.setOption(
      { ...option, animation: !reducedMotion, animationDuration: reducedMotion ? 0 : 250 },
      { notMerge: true },
    );
    syncPrintableSvgViewBox(containerRef.current);
  }, [option]);

  return (
    <div
      aria-label={ariaLabel}
      className={`report-echart-container ${className}`}
      ref={containerRef}
      role="img"
    />
  );
}
