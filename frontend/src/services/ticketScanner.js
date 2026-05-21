export async function scanConcreteTicket(file) {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 900);
  });

  const baseName = file?.name?.replace(/\.[^.]+$/, '') || 'ticket';
  const numericSeed = Array.from(baseName).reduce((sum, character) => sum + character.charCodeAt(0), 0);

  return {
    ticket_number: `TKT-${String(numericSeed % 100000).padStart(5, '0')}`,
    truck_number: String(9000 + (numericSeed % 700)),
    mix_design: `MD-${String(4000 + (numericSeed % 500)).padStart(4, '0')}`,
    time_batched: '07:30'
  };
}
