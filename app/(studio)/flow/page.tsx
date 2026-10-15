import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { isFlowCanvasEnabled } from '@/lib/flags';
import FlowCanvas from '@/components/flow/FlowCanvas';

export const metadata = {
  title: 'Flow canvas – zVas Banner AI',
  robots: { index: false },
};

export default async function FlowPage({ searchParams }: { searchParams: Promise<{ template?: string | string[]; doc?: string | string[] }> }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Flag tắt → 404, không lộ sự tồn tại của route.
  if (!isFlowCanvasEnabled(userId)) notFound();

  const { template, doc } = await searchParams;
  return (
    <FlowCanvas
      initialTemplateId={typeof template === 'string' ? template : undefined}
      initialDocId={typeof doc === 'string' ? doc : undefined}
    />
  );
}
