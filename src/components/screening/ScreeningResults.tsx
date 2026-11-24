import './ScreeningResults.scss';

export type ScreeningStatus = 'in-range' | 'above-range' | 'below-range';

export interface ScreeningResult {
  /** Test name, e.g. "Herpes Simplex Virus 1" */
  name: string;
  status: ScreeningStatus;
  /** Display value, e.g. "53.4", "Not Detected", "Non-reactive" */
  value: string;
  /** Optional unit shown after the value in muted text, e.g. "index" */
  unit?: string;
}

export interface ScreeningResultsProps {
  results: ScreeningResult[];
  /** Date the sample was collected. Accepts a Date or an ISO string ("2026-11-24"). */
  testDate: Date | string;
  /** Optional label shown before the date. Defaults to "Collected". */
  dateLabel?: string;
}

const STATUS_LABEL: Record<ScreeningStatus, string> = {
  'in-range': 'In Range',
  'above-range': 'Above Range',
  'below-range': 'Below Range',
};

function formatDate(input: Date | string): string {
  // Parse bare ISO dates as local dates so they don't shift a day in negative UTC offsets.
  const date =
    typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)
      ? new Date(`${input}T00:00:00`)
      : new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ScreeningResults({
  results,
  testDate,
  dateLabel = 'Collected',
}: ScreeningResultsProps) {
  return (
    <div className="screening-results">
      <div className="screening-results__date">
        {dateLabel} <span className="screening-results__dot">·</span>{' '}
        <span className="screening-results__date-value">
          {formatDate(testDate)}
        </span>
      </div>
      <ul className="screening-results__list">
        {results.map((r) => (
          <li className="screening-results__row" key={r.name}>
            <div className="screening-results__name">{r.name}</div>
            <div className="screening-results__line">
              <span
                className={`screening-results__status screening-results__status--${r.status}`}
              >
                {STATUS_LABEL[r.status]}
              </span>
              <span className="screening-results__dot">·</span>
              <span className="screening-results__value">{r.value}</span>
              {r.unit && (
                <span className="screening-results__unit">{r.unit}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Example data matching the reference screen. */
export const SAMPLE_SCREENING: ScreeningResult[] = [
  { name: 'Herpes Simplex Virus 1', status: 'above-range', value: '53.4', unit: 'index' },
  { name: 'Chlamydia', status: 'in-range', value: 'Not Detected' },
  { name: 'Gonorrhea', status: 'in-range', value: 'Not Detected' },
  { name: 'HIV 1 & 2 Antigen-Antibody', status: 'in-range', value: 'Non-reactive' },
  { name: 'Herpes Simplex Virus 2', status: 'above-range', value: '1.05', unit: 'index' },
  { name: 'Syphilis - Rapid Plasma Reagin (RPR)', status: 'in-range', value: 'Non-reactive' },
  { name: 'Trichomonas', status: 'in-range', value: 'Not Detected' },
];
