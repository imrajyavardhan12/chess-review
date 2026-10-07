import { useId } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

/**
 * A row of mutually exclusive choices. Native radio inputs sit under the styled labels, so arrow-key
 * navigation, focus and screen-reader semantics are the browser's own.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  block = false,
}: {
  label: string
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  /** Stretch to the full width of the container. */
  block?: boolean
}) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label={label} className={`segmented${block ? ' block' : ''}`}>
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  )
}
