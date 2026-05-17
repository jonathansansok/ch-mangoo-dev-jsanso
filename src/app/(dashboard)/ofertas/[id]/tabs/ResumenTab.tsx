import { MarkdownViewer } from './MarkdownViewer';
import { SummaryActions } from './SummaryActions';

interface Props {
  offerId: number;
  reconciliationId: number;
  summary: string;
}

export function ResumenTab({ offerId, reconciliationId, summary }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <SummaryActions offerId={offerId} reconciliationId={reconciliationId} summary={summary} />
      <MarkdownViewer source={summary} />
    </div>
  );
}
