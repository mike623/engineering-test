export function IncompleteNotice({ dropped }: { dropped: number }) {
  if (dropped === 0) {
    return null;
  }

  return (
    <p role="status" className="notice">
      {dropped === 1
        ? '1 record is not shown because it arrived incomplete.'
        : `${dropped} records are not shown because they arrived incomplete.`}
    </p>
  );
}
