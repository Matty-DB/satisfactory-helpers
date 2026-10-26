// Power planner. Pure functions, no DOM — tested with `node --test tests/`.

const MINERS = ['Desc_MinerMk1_C', 'Desc_MinerMk2_C', 'Desc_MinerMk3_C'];

/** Fuel and water for `count` generators running at 100%. */
export function powerPlan(data, genId, fuelId, count) {
  const gen = data.generators.find((g) => g.id === genId);
  const fuel = gen.fuels.find(([f]) => f === fuelId);
  if (!fuel) throw new Error(`${fuelId} does not burn in ${genId}`);
  const [, mj] = fuel;
  const fuelPerGen = (gen.mw * 60) / mj;
  const waterPerGen = (gen.mw * gen.water * 60) / 1000;
  const fuelTotal = fuelPerGen * count;
  const waterTotal = waterPerGen * count;
  const pump = data.extractors.Desc_WaterPump_C;
  const waterExtractors = waterTotal ? Math.ceil(waterTotal / pump.rate - 1e-9) : 0;
  const item = data.items[fuelId];
  // Miners only make sense for a raw solid fuel such as Coal; normal-purity node at 100%.
  const miners = item?.raw && !item.f
    ? MINERS.map((id) => ({ id, n: data.extractors[id].n, count: Math.ceil(fuelTotal / data.extractors[id].rate - 1e-9), mw: data.extractors[id].mw }))
    : [];
  const gross = gen.mw * count;
  const extractorMW = waterExtractors * pump.mw;
  return {
    gen, fuelId, count, mj,
    fuelPerGen, waterPerGen, fuelTotal, waterTotal,
    waterExtractors, extractorMW, miners,
    gross, net: gross - extractorMW,
  };
}

/** Smallest generator count that reaches `mw` after paying for water extractors. */
export function generatorsFor(data, genId, fuelId, mw) {
  for (let n = 1; n < 10000; n++) if (powerPlan(data, genId, fuelId, n).net >= mw - 1e-9) return n;
  return Infinity;
}
