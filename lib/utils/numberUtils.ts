/**
 * Map a range of values to a new range.
 * @returns Value mapped from original range to new range.
 */
export const mapValueRange = (
  originalRangeStart: number,
  originalRangeEnd: number,
  newRangeStart: number,
  newRangeEnd: number,
  value: number,
) => {
  if (typeof originalRangeStart !== 'number') throw new TypeError('expected_original_range_start_number');
  if (typeof originalRangeEnd !== 'number') throw new TypeError('expected_original_range_end_number');
  if (typeof newRangeStart !== 'number') throw new TypeError('expected_new_range_start_number');
  if (typeof newRangeEnd !== 'number') throw new TypeError('expected_new_range_end_number');
  if (typeof value !== 'number') throw new TypeError('expected_value_number');

  return (
    newRangeStart +
    ((newRangeEnd - newRangeStart) / (originalRangeEnd - originalRangeStart)) *
      (Math.min(Math.max(originalRangeStart, value), originalRangeEnd) - originalRangeStart)
  );
};
