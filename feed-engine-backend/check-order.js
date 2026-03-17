const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const o = await p.order.findFirst({
    where: { id: 'c01a6745-ebf4-445f-acdd-2a4ed4effd26' },
    include: { submissions: true }
  });
  console.log('=== ORDER ===');
  if (o) {
    console.log('status:', o.status);
    console.log('requiredFeeders:', o.requiredFeeders);
    console.log('sourceProtocol:', o.sourceProtocol);
    console.log('externalRequestId:', o.externalRequestId);
    console.log('finalPrice:', o.finalPrice);
    console.log('submissions count:', o.submissions.length);
    o.submissions.forEach((s, i) => {
      console.log(`  sub[${i}]: feederId=${s.feederId}, priceHash=${s.priceHash ? 'SET' : 'NULL'}, revealedPrice=${s.revealedPrice}, deviation=${s.deviation}`);
    });
  } else {
    console.log('ORDER NOT FOUND');
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
