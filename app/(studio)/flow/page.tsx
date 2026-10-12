import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { isFlowCanvasEnabled } from '@/lib/flags';
import FlowCanvas from '@/components/flow/FlowCanvas';

export const metadata = {
  title: 'Flow canvas – zVas Banner AI',
  robots: { index: false },
};

export default async function FlowPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  // Flag tắt → 404, không lộ sự tồn tại của route.
  if (!isFlowCanvasEnabled(userId)) notFound();

  return <FlowCanvas />;
}
