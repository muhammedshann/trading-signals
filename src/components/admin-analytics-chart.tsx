'use client';

import { useState, useMemo } from 'react';
import {
  Banknote,
  UsersRound,
  Bot,
  Calendar,
  TrendingUp,
  Award,
  Activity,
  Layers,
} from 'lucide-react';

export type AnalyticsPayment = {
  amount_inr: number;
  paid_at: string | null;
  created_at: string;
};

export type AnalyticsMember = {
  created_at: string;
};

export type AnalyticsSubscription = {
  created_at: string;
  status: string;
};

export type AnalyticsBotMember = {
  joined_at: string;
  kicked_at: string | null;
};

type MetricType = 'profit' | 'members' | 'telegram';
type RangeType = '7d' | '30d' | '90d' | 'all';

export function AdminAnalyticsChart({
  payments,
  members,
  subscriptions,
  botMembers,
}: {
  payments: AnalyticsPayment[];
  members: AnalyticsMember[];
  subscriptions: AnalyticsSubscription[];
  botMembers: AnalyticsBotMember[];
}) {
  // 1st show profit on beginning, then change based on filter
  const [metric, setMetric] = useState<MetricType>('profit');
  const [range, setRange] = useState<RangeType>('30d');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const daysCount = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 180;

  const chartData = useMemo(() => {
    const now = new Date();
    const buckets: {
      dateLabel: string;
      fullDate: string;
      startTime: number;
      endTime: number;
      valuePrimary: number;
      valueSecondary: number;
      count: number;
    }[] = [];

    const isDaily = daysCount <= 30;
    const stepDays = isDaily ? 1 : daysCount <= 90 ? 3 : 7;
    const totalBuckets = Math.ceil(daysCount / stepDays);

    for (let i = totalBuckets - 1; i >= 0; i--) {
      const endBucketDate = new Date(now.getTime() - i * stepDays * 24 * 60 * 60 * 1000);
      endBucketDate.setHours(23, 59, 59, 999);
      const startBucketDate = new Date(endBucketDate.getTime() - stepDays * 24 * 60 * 60 * 1000 + 1);

      const dateLabel = isDaily
        ? endBucketDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : `${startBucketDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${endBucketDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;

      const fullDate = isDaily
        ? endBucketDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
        : dateLabel;

      buckets.push({
        dateLabel,
        fullDate,
        startTime: startBucketDate.getTime(),
        endTime: endBucketDate.getTime(),
        valuePrimary: 0,
        valueSecondary: 0,
        count: 0,
      });
    }

    if (metric === 'profit') {
      payments.forEach(p => {
        const time = new Date(p.paid_at || p.created_at).getTime();
        const bucket = buckets.find(b => time >= b.startTime && time <= b.endTime);
        if (bucket) {
          bucket.valuePrimary += Number(p.amount_inr || 0);
          bucket.count += 1;
        }
      });
    } else if (metric === 'members') {
      members.forEach(m => {
        const time = new Date(m.created_at).getTime();
        const bucket = buckets.find(b => time >= b.startTime && time <= b.endTime);
        if (bucket) {
          bucket.valuePrimary += 1;
        }
      });
      subscriptions.forEach(s => {
        const time = new Date(s.created_at).getTime();
        const bucket = buckets.find(b => time >= b.startTime && time <= b.endTime);
        if (bucket) {
          bucket.valueSecondary += 1;
        }
      });
    } else if (metric === 'telegram') {
      botMembers.forEach(b => {
        const joinTime = new Date(b.joined_at).getTime();
        const joinBucket = buckets.find(buck => joinTime >= buck.startTime && joinTime <= buck.endTime);
        if (joinBucket) {
          joinBucket.valuePrimary += 1;
        }
        if (b.kicked_at) {
          const kickTime = new Date(b.kicked_at).getTime();
          const kickBucket = buckets.find(buck => kickTime >= buck.startTime && kickTime <= buck.endTime);
          if (kickBucket) {
            kickBucket.valueSecondary += 1;
          }
        }
      });
    }

    return buckets;
  }, [metric, range, daysCount, payments, members, subscriptions, botMembers]);

  // Aggregate summary values
  const summary = useMemo(() => {
    let totalPrimary = 0;
    let totalSecondary = 0;
    let peakValue = 0;
    let peakDate = '—';
    let totalOrders = 0;

    chartData.forEach(b => {
      totalPrimary += b.valuePrimary;
      totalSecondary += b.valueSecondary;
      totalOrders += b.count;
      if (b.valuePrimary > peakValue) {
        peakValue = b.valuePrimary;
        peakDate = b.dateLabel;
      }
    });

    const avgDaily = Math.round(totalPrimary / Math.max(1, chartData.length));

    return {
      totalPrimary,
      totalSecondary,
      peakValue,
      peakDate,
      totalOrders,
      avgDaily,
    };
  }, [chartData]);

  // SVG Chart Dimensions & Math
  const maxVal = Math.max(...chartData.map(d => Math.max(d.valuePrimary, d.valueSecondary)), 10);
  const chartHeight = 220;
  const chartWidth = 840;
  const paddingLeft = 55;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;
  const graphWidth = chartWidth - paddingLeft - paddingRight;
  const graphHeight = chartHeight - paddingTop - paddingBottom;

  const barWidth = Math.max(6, Math.min(26, (graphWidth / chartData.length) * 0.65));

  const hoveredData = hoveredIdx !== null ? chartData[hoveredIdx] : null;

  return (
    <div className="admin-analytics-chart-container">
      {/* Top Header & Interactive Filter Bar */}
      <div className="admin-chart-header">
        <div className="admin-chart-title">
          <span className="eyebrow">DASHBOARD INTELLIGENCE</span>
          <h2>
            {metric === 'profit'
              ? 'Revenue & Profit Analytics'
              : metric === 'members'
              ? 'Member & Subscription Growth'
              : 'Telegram Bot Community Activity'}
          </h2>
        </div>

        <div className="admin-chart-filters">
          {/* Metric Selector Tabs */}
          <div className="admin-filter-group" role="tablist" aria-label="Select Metric">
            <button
              type="button"
              className={`admin-filter-btn ${metric === 'profit' ? 'active' : ''}`}
              onClick={() => {
                setMetric('profit');
                setHoveredIdx(null);
              }}
            >
              <Banknote size={14} /> Revenue &amp; Profit
            </button>
            <button
              type="button"
              className={`admin-filter-btn ${metric === 'members' ? 'active' : ''}`}
              onClick={() => {
                setMetric('members');
                setHoveredIdx(null);
              }}
            >
              <UsersRound size={14} /> Members &amp; Subs
            </button>
            <button
              type="button"
              className={`admin-filter-btn ${metric === 'telegram' ? 'active' : ''}`}
              onClick={() => {
                setMetric('telegram');
                setHoveredIdx(null);
              }}
            >
              <Bot size={14} /> Telegram Joins / Kicks
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="admin-filter-group" role="group" aria-label="Time Range">
            {(['7d', '30d', '90d', 'all'] as RangeType[]).map(r => (
              <button
                key={r}
                type="button"
                className={`admin-range-btn ${range === r ? 'active' : ''}`}
                onClick={() => {
                  setRange(r);
                  setHoveredIdx(null);
                }}
              >
                {r === '7d' ? '7D' : r === '30d' ? '30D' : r === '90d' ? '90D' : 'All'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Highlight Strip for Selected Filter */}
      <div className="admin-chart-kpi-bar">
        <div className="admin-chart-kpi">
          <span className="admin-chart-kpi-label">
            <TrendingUp size={13} className="text-emerald" />
            {metric === 'profit'
              ? 'Period Revenue'
              : metric === 'members'
              ? 'New Members'
              : 'VIP Group Joins'}
          </span>
          <b>
            {metric === 'profit'
              ? `₹${summary.totalPrimary.toLocaleString('en-IN')}`
              : summary.totalPrimary}
          </b>
        </div>

        {metric === 'profit' && (
          <div className="admin-chart-kpi">
            <span className="admin-chart-kpi-label">
              <Activity size={13} className="text-emerald" /> Average Daily Pace
            </span>
            <b>₹{summary.avgDaily.toLocaleString('en-IN')}/day</b>
          </div>
        )}

        {metric === 'members' && (
          <div className="admin-chart-kpi">
            <span className="admin-chart-kpi-label">
              <Layers size={13} className="text-emerald" /> Plan Activations
            </span>
            <b>{summary.totalSecondary}</b>
          </div>
        )}

        {metric === 'telegram' && (
          <div className="admin-chart-kpi">
            <span className="admin-chart-kpi-label">
              <Bot size={13} className="text-danger" /> Banned / Kicked
            </span>
            <b>{summary.totalSecondary}</b>
          </div>
        )}

        <div className="admin-chart-kpi">
          <span className="admin-chart-kpi-label">
            <Award size={13} className="text-emerald" /> Peak Activity
          </span>
          <b>
            {metric === 'profit'
              ? `₹${summary.peakValue.toLocaleString('en-IN')}`
              : `${summary.peakValue} events`}
            {summary.peakDate !== '—' && <small> · {summary.peakDate}</small>}
          </b>
        </div>
      </div>

      {/* SVG Interactive Canvas */}
      <div className="admin-svg-wrapper">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="admin-svg-chart"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8bff28" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8bff28" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="memberGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ba3ff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4ba3ff" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8bff28" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8bff28" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="kickGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff7070" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#ff7070" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
            const y = paddingTop + graphHeight * (1 - fraction);
            const labelVal = Math.round(maxVal * fraction);
            const labelText =
              metric === 'profit'
                ? labelVal >= 1000
                  ? `₹${Math.round(labelVal / 1000)}k`
                  : `₹${labelVal}`
                : String(labelVal);
            return (
              <g key={fraction}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#222"
                  strokeDasharray="2 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#666"
                  fontSize="9"
                  fontFamily="var(--mono)"
                >
                  {labelText}
                </text>
              </g>
            );
          })}

          {/* Chart Bars / Columns */}
          {chartData.map((d, i) => {
            const stepX = graphWidth / chartData.length;
            const xCenter = paddingLeft + i * stepX + stepX / 2;
            const x = xCenter - barWidth / 2;

            const heightPrimary = (d.valuePrimary / maxVal) * graphHeight;
            const yPrimary = paddingTop + graphHeight - heightPrimary;

            const heightSecondary = (d.valueSecondary / maxVal) * graphHeight;
            const ySecondary = paddingTop + graphHeight - heightSecondary;

            const isHovered = hoveredIdx === i;

            return (
              <g
                key={i}
                className="chart-col-group"
                onMouseEnter={() => setHoveredIdx(i)}
                style={{ cursor: 'pointer' }}
              >
                {/* Invisible hover trigger zone */}
                <rect
                  x={xCenter - stepX / 2}
                  y={paddingTop}
                  width={stepX}
                  height={graphHeight}
                  fill="transparent"
                />

                {/* Highlight bar glow behind */}
                {isHovered && (
                  <rect
                    x={xCenter - stepX / 2 + 1}
                    y={paddingTop}
                    width={stepX - 2}
                    height={graphHeight}
                    fill="rgba(255, 255, 255, 0.04)"
                    rx="4"
                  />
                )}

                {/* Primary Column */}
                {d.valuePrimary > 0 && (
                  <rect
                    x={metric === 'profit' ? x : x - barWidth / 2.5}
                    y={yPrimary}
                    width={metric === 'profit' ? barWidth : barWidth * 0.8}
                    height={Math.max(2, heightPrimary)}
                    fill={metric === 'profit' ? 'url(#profitGrad)' : 'url(#memberGrad)'}
                    rx="3"
                    opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                  />
                )}

                {/* Secondary Column (for Members/Subs or Joins/Kicks) */}
                {metric !== 'profit' && d.valueSecondary > 0 && (
                  <rect
                    x={x + barWidth / 2.5}
                    y={ySecondary}
                    width={barWidth * 0.8}
                    height={Math.max(2, heightSecondary)}
                    fill={metric === 'members' ? 'url(#subGrad)' : 'url(#kickGrad)'}
                    rx="3"
                    opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                  />
                )}

                {/* X-axis label (sampled if many bars) */}
                {(chartData.length <= 14 || i % Math.ceil(chartData.length / 8) === 0) && (
                  <text
                    x={xCenter}
                    y={chartHeight - 12}
                    textAnchor="middle"
                    fill={isHovered ? '#eee' : '#777'}
                    fontSize="8.5"
                    fontFamily="var(--mono)"
                  >
                    {d.dateLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Floating Tooltip */}
        {hoveredData && (
          <div className="admin-chart-tooltip" role="tooltip">
            <span className="admin-tooltip-date">{hoveredData.fullDate}</span>
            {metric === 'profit' ? (
              <div className="admin-tooltip-row">
                <span className="admin-tooltip-badge text-emerald">₹</span>
                <div>
                  <strong>₹{hoveredData.valuePrimary.toLocaleString('en-IN')}</strong>
                  <small>{hoveredData.count} completed checkout(s)</small>
                </div>
              </div>
            ) : metric === 'members' ? (
              <>
                <div className="admin-tooltip-row">
                  <span className="admin-tooltip-dot" style={{ background: '#4ba3ff' }} />
                  <span>New Signups: <b>{hoveredData.valuePrimary}</b></span>
                </div>
                <div className="admin-tooltip-row">
                  <span className="admin-tooltip-dot" style={{ background: '#8bff28' }} />
                  <span>Subscriptions: <b>{hoveredData.valueSecondary}</b></span>
                </div>
              </>
            ) : (
              <>
                <div className="admin-tooltip-row">
                  <span className="admin-tooltip-dot" style={{ background: '#8bff28' }} />
                  <span>Bot Joins: <b>{hoveredData.valuePrimary}</b></span>
                </div>
                <div className="admin-tooltip-row">
                  <span className="admin-tooltip-dot" style={{ background: '#ff7070' }} />
                  <span>Banned/Kicked: <b>{hoveredData.valueSecondary}</b></span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="admin-chart-legend">
        {metric === 'profit' ? (
          <span>
            <span className="admin-legend-box" style={{ background: '#8bff28' }} /> Verified Net Revenue
          </span>
        ) : metric === 'members' ? (
          <>
            <span>
              <span className="admin-legend-box" style={{ background: '#4ba3ff' }} /> New Registered Members
            </span>
            <span>
              <span className="admin-legend-box" style={{ background: '#8bff28' }} /> Paid Plan Activations
            </span>
          </>
        ) : (
          <>
            <span>
              <span className="admin-legend-box" style={{ background: '#8bff28' }} /> Verified VIP Joins
            </span>
            <span>
              <span className="admin-legend-box" style={{ background: '#ff7070' }} /> Banned / Kicked Members
            </span>
          </>
        )}
      </div>
    </div>
  );
}
