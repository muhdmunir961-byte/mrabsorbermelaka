import { useEffect, useState } from 'react';
import { AnalyticsReport, formatRinggit } from '@mr/shared';
import type { MonthlyPoint } from '@mr/shared';
import { ApiError, api } from '../lib/api';

const MONTHS = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ogos',
  'Sep',
  'Okt',
  'Nov',
  'Dis',
];

/**
 * A plain CSS bar chart. No chart library: the values are integers and the job
 * is comparison, so an extra dependency would buy nothing.
 */
function BarSeries({
  points,
  label,
  format,
}: {
  points: MonthlyPoint[];
  label: string;
  format: (value: number) => string;
}) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const total = points.reduce((sum, point) => sum + point.value, 0);

  return (
    <figure className="rounded-panel border border-border bg-surface p-5">
      <figcaption className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </figcaption>
      <p className="tabular mt-1 text-2xl font-bold">{format(total)}</p>
      <p className="text-xs text-ink-muted">jumlah sepanjang tahun</p>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Belum ada data untuk tahun ini.</p>
      ) : (
        <ul className="mt-4 flex items-end gap-1" aria-hidden="true">
          {points.map((point) => (
            <li key={point.month} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent"
                style={{
                  height: `${Math.max((point.value / max) * 96, point.value > 0 ? 4 : 1)}px`,
                }}
              />
              <span className="text-[10px] text-ink-muted">{MONTHS[point.month - 1]}</span>
            </li>
          ))}
        </ul>
      )}

      <table className="sr-only">
        <caption>{label} mengikut bulan</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.month}>
              <th scope="row">{MONTHS[point.month - 1]}</th>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function AnalyticsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    api(`/analytics/report?year=${year}`, AnalyticsReport)
      .then((next) => {
        if (!active) return;
        setReport(next);
        setLoaded(true);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof ApiError ? caught.message : 'Laporan tidak dapat dimuatkan.');
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [year]);

  const d = report?.attendanceDistribution;
  const distributionTotal = d ? d.present + d.late + d.onMc + d.absent + d.leave : 0;
  const DISTRIBUTION_ROWS: [string, number][] = [
    ['Hadir', d?.present ?? 0],
    ['Lewat', d?.late ?? 0],
    ['MC', d?.onMc ?? 0],
    ['Tidak hadir', d?.absent ?? 0],
    ['Cuti', d?.leave ?? 0],
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Executive Analytics</h1>
          <p className="mt-1 text-sm text-ink-muted">Laporan prestasi strategik.</p>
        </div>
        <div>
          <label htmlFor="analytics-year" className="sr-only">
            Tahun
          </label>
          <input
            id="analytics-year"
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="tabular w-28 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </div>
      </header>

      <p role="alert" aria-live="polite" className="min-h-5 text-sm text-accent">
        {error}
      </p>

      {!loaded ? (
        <p role="status" className="text-sm text-ink-muted">
          Mengira…
        </p>
      ) : report ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarSeries
              points={report.revenueByMonth}
              label="Hasil mengikut bulan"
              format={formatRinggit}
            />
            <BarSeries
              points={report.jobsByMonth}
              label="Jumlah kerja siap"
              format={(value) => `${value} kerja`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section
              aria-labelledby="distribution-heading"
              className="rounded-panel border border-border bg-surface p-5"
            >
              <h2
                id="distribution-heading"
                className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
              >
                Taburan kehadiran
              </h2>
              {distributionTotal === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">Belum ada rekod kehadiran.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm">
                  {DISTRIBUTION_ROWS.map(([label, count]) => (
                    <li key={label} className="flex items-center justify-between gap-3">
                      <span>{label}</span>
                      <span className="tabular font-medium">
                        {count}{' '}
                        <span className="text-xs font-normal text-ink-muted">
                          ({Math.round((count / distributionTotal) * 100)}%)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="performers-heading"
              className="rounded-panel border border-border bg-surface p-5"
            >
              <h2
                id="performers-heading"
                className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
              >
                Prestasi terbaik
              </h2>
              {report.topPerformers.length === 0 ? (
                <p className="mt-3 text-sm text-ink-muted">Belum ada kerja siap tahun ini.</p>
              ) : (
                <ol className="mt-3 space-y-2 text-sm">
                  {report.topPerformers.map((person, index) => (
                    <li key={person.employeeId} className="flex justify-between gap-3">
                      <span>
                        <span className="tabular mr-2 text-ink-muted">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="font-medium">{person.fullName}</span>
                        <span className="block pl-7 text-xs text-ink-muted">
                          {person.jobsCompleted} kerja
                        </span>
                      </span>
                      <span className="tabular font-semibold text-success">
                        {formatRinggit(person.commissionSen)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section
            aria-labelledby="services-heading"
            className="rounded-panel border border-border bg-surface p-5"
          >
            <h2
              id="services-heading"
              className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
            >
              Servis popular mengikut hasil
            </h2>
            {report.popularServices.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">Belum ada servis siap tahun ini.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {report.popularServices.map((service) => (
                  <li key={service.serviceName} className="flex justify-between gap-3">
                    <span>
                      {service.serviceName}
                      <span className="block text-xs text-ink-muted">
                        {service.jobsCompleted} kerja
                      </span>
                    </span>
                    <span className="tabular font-semibold">
                      {formatRinggit(service.revenueSen)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
