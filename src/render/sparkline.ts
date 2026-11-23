/** Inline SVG bars for the dashboard (no script). */
export function svgSparkline(values: readonly number[], opts: { width?: number; height?: number } = {}): string {
    const width = opts.width ?? 360;
    const height = opts.height ?? 40;
    const n = Math.max(values.length, 1);
    const max = Math.max(0, ...values);
    const bw = width / n;
    const bars = values.map((v, i) => {
        const h = max > 0 ? Math.round((v / max) * height) : 0;
        const x = (i * bw).toFixed(2);
        const w = Math.max(bw - 1, 1).toFixed(2);
        return `<rect x="${x}" y="${height - h}" width="${w}" height="${h}" rx="1"><title>${v}</title></rect>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="chats per day">${bars.join('')}</svg>`;
}
