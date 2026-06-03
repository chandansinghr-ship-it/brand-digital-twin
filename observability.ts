export interface Span {
  traceId: string;
  spanId: string;
  parentId?: string;
  operationName: string;
  platform: string;
  startTimeMs: number;
  endTimeMs?: number;
  durationMs?: number;
  status: "success" | "failure";
  error?: string;
}

export interface Metric {
  name: string;
  platform: string;
  value: number;
  timestamp: string;
}

export class MetricsTracker {
  private spans: Span[] = [];
  private metrics: Metric[] = [];
  private alerts: string[] = [];

  startSpan(operationName: string, platform: string, parentId?: string): Span {
    const span: Span = {
      traceId: Math.random().toString(36).substring(7),
      spanId: Math.random().toString(36).substring(7),
      parentId,
      operationName,
      platform,
      startTimeMs: Date.now(),
      status: "success",
    };
    this.spans.push(span);
    return span;
  }

  endSpan(spanId: string, status: "success" | "failure", error?: string) {
    const span = this.spans.find(s => s.spanId === spanId);
    if (span) {
      span.endTimeMs = Date.now();
      span.durationMs = span.endTimeMs - span.startTimeMs;
      span.status = status;
      span.error = error;

      this.recordMetric({
        name: `${span.operationName}_latency_ms`,
        platform: span.platform,
        value: span.durationMs,
        timestamp: new Date().toISOString(),
      });
    }
  }

  recordMetric(metric: Metric) {
    this.metrics.push(metric);
  }

  raiseAlert(message: string) {
    const alert = `[ALERT] [${new Date().toISOString()}] ${message}`;
    this.alerts.push(alert);
  }

  getAlerts(): string[] {
    return this.alerts;
  }

  getSpans(): Span[] {
    return this.spans;
  }

  getMetrics(): Metric[] {
    return this.metrics;
  }

  getAverageLatency(platform: string, operation: string): number {
    const related = this.spans.filter(s => s.platform === platform && s.operationName === operation && s.durationMs !== undefined);
    if (related.length === 0) return 0;
    const sum = related.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    return sum / related.length;
  }
}
