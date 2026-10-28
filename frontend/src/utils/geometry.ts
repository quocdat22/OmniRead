/**
 * Chuyển đổi danh sách các bounding boxes (các dòng của 1 câu) thành một đường dẫn SVG duy nhất (SVG Path)
 * tạo thành 1 khối thống nhất liền mạch ("1 một khối luôn"), không bị các đường viền bên trong cắt nhau
 * hoặc chồng lấn gây mất thẩm mỹ.
 */
export function rectsToUnifiedPolygonPath(
  rects: [number, number, number, number][],
  cornerRadius = 3.5,
  snapThreshold = 24.0
): string {
  if (!rects || rects.length === 0) return "";

  if (rects.length === 1) {
    const [x0, y0, x1, y1] = rects[0];
    const r = Math.min(cornerRadius, (x1 - x0) / 2, (y1 - y0) / 2);
    return (
      `M ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} ` +
      `H ${(x1 - r).toFixed(2)} Q ${x1.toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + r).toFixed(2)} ` +
      `V ${(y1 - r).toFixed(2)} Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${(x1 - r).toFixed(2)} ${y1.toFixed(2)} ` +
      `H ${(x0 + r).toFixed(2)} Q ${x0.toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - r).toFixed(2)} ` +
      `V ${(y0 + r).toFixed(2)} Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} Z`
    );
  }

  // Sắp xếp các dòng từ trên xuống dưới
  const sorted = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const n = sorted.length;

  const minX0 = Math.min(...sorted.map((r) => r[0]));
  const maxX1 = Math.max(...sorted.map((r) => r[2]));

  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    let [x0, y0, x1, y1] = sorted[i];

    // Căn chỉnh mép trái nếu sát với lề trái của cột văn bản
    if (Math.abs(x0 - minX0) <= snapThreshold / 2) {
      x0 = minX0;
    }

    // Căn chỉnh mép phải cho các dòng đầy đủ (full-width)
    if (i < n - 1 || Math.abs(x1 - maxX1) <= snapThreshold) {
      if (Math.abs(x1 - maxX1) <= snapThreshold) {
        x1 = maxX1;
      }
    }

    const yTop = i === 0 ? y0 : (sorted[i - 1][3] + y0) / 2;
    const yBot = i === n - 1 ? y1 : (y1 + sorted[i + 1][1]) / 2;
    lines.push([x0, yTop, x1, yBot]);
  }

  // Trường hợp đặc biệt: Tất cả các dòng đều cùng lề trái và lề phải -> Trở thành 1 hình chữ nhật hoàn hảo!
  const allSameX0 = lines.every((l) => Math.abs(l[0] - lines[0][0]) < 0.5);
  const allSameX1 = lines.every((l) => Math.abs(l[2] - lines[0][2]) < 0.5);
  if (allSameX0 && allSameX1) {
    const x0 = lines[0][0];
    const x1 = lines[0][2];
    const y0 = lines[0][1];
    const y1 = lines[n - 1][3];
    const r = Math.min(cornerRadius, (x1 - x0) / 2, (y1 - y0) / 2);
    return (
      `M ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} ` +
      `H ${(x1 - r).toFixed(2)} Q ${x1.toFixed(2)} ${y0.toFixed(2)} ${x1.toFixed(2)} ${(y0 + r).toFixed(2)} ` +
      `V ${(y1 - r).toFixed(2)} Q ${x1.toFixed(2)} ${y1.toFixed(2)} ${(x1 - r).toFixed(2)} ${y1.toFixed(2)} ` +
      `H ${(x0 + r).toFixed(2)} Q ${x0.toFixed(2)} ${y1.toFixed(2)} ${x0.toFixed(2)} ${(y1 - r).toFixed(2)} ` +
      `V ${(y0 + r).toFixed(2)} Q ${x0.toFixed(2)} ${y0.toFixed(2)} ${(x0 + r).toFixed(2)} ${y0.toFixed(2)} Z`
    );
  }

  // Xây dựng các đỉnh chu vi theo chiều kim đồng hồ
  const pts: [number, number][] = [];

  // 1. Cạnh trên cùng của dòng đầu tiên
  pts.push([lines[0][0], lines[0][1]]);
  pts.push([lines[0][2], lines[0][1]]);

  // 2. Đi xuống mép phải
  for (let i = 0; i < n - 1; i++) {
    const currX1 = lines[i][2];
    const nextX1 = lines[i + 1][2];
    const splitY = lines[i][3];
    pts.push([currX1, splitY]);
    if (Math.abs(currX1 - nextX1) > 0.5) {
      pts.push([nextX1, splitY]);
    }
  }
  pts.push([lines[n - 1][2], lines[n - 1][3]]);

  // 3. Cạnh dưới cùng của dòng cuối
  pts.push([lines[n - 1][0], lines[n - 1][3]]);

  // 4. Đi lên mép trái
  for (let i = n - 1; i > 0; i--) {
    const currX0 = lines[i][0];
    const prevX0 = lines[i - 1][0];
    const splitY = lines[i][1];
    pts.push([currX0, splitY]);
    if (Math.abs(currX0 - prevX0) > 0.5) {
      pts.push([prevX0, splitY]);
    }
  }

  // Đơn giản hóa các điểm thẳng hàng (collinear reduction)
  const cleanPts: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const pPrev = cleanPts[cleanPts.length - 1];
    const pCurr = pts[i];
    const pNext = pts[(i + 1) % pts.length];

    if (!pPrev) {
      cleanPts.push(pCurr);
      continue;
    }

    // Tránh trùng lặp điểm
    if (Math.abs(pCurr[0] - pPrev[0]) < 0.1 && Math.abs(pCurr[1] - pPrev[1]) < 0.1) {
      continue;
    }

    // Kiểm tra thẳng hàng
    const cross =
      (pCurr[0] - pPrev[0]) * (pNext[1] - pPrev[1]) -
      (pCurr[1] - pPrev[1]) * (pNext[0] - pPrev[0]);
    if (Math.abs(cross) > 1e-3) {
      cleanPts.push(pCurr);
    }
  }

  const nPts = cleanPts.length;
  if (nPts < 3) return "";

  const cmds: string[] = [];
  const r = cornerRadius;
  for (let i = 0; i < nPts; i++) {
    const pPrev = cleanPts[(i - 1 + nPts) % nPts];
    const pCurr = cleanPts[i];
    const pNext = cleanPts[(i + 1) % nPts];

    const vPrev = [pPrev[0] - pCurr[0], pPrev[1] - pCurr[1]];
    const dPrev = Math.hypot(vPrev[0], vPrev[1]);
    const vNext = [pNext[0] - pCurr[0], pNext[1] - pCurr[1]];
    const dNext = Math.hypot(vNext[0], vNext[1]);

    if (dPrev < 1e-4 || dNext < 1e-4) continue;

    const curR = Math.min(r, dPrev / 2, dNext / 2);
    const startPt = [
      pCurr[0] + (vPrev[0] / dPrev) * curR,
      pCurr[1] + (vPrev[1] / dPrev) * curR,
    ];
    const endPt = [
      pCurr[0] + (vNext[0] / dNext) * curR,
      pCurr[1] + (vNext[1] / dNext) * curR,
    ];

    if (i === 0) {
      cmds.push(`M ${startPt[0].toFixed(2)} ${startPt[1].toFixed(2)}`);
    } else {
      cmds.push(`L ${startPt[0].toFixed(2)} ${startPt[1].toFixed(2)}`);
    }
    cmds.push(
      `Q ${pCurr[0].toFixed(2)} ${pCurr[1].toFixed(2)} ${endPt[0].toFixed(2)} ${endPt[1].toFixed(2)}`
    );
  }

  cmds.push("Z");
  return cmds.join(" ");
}
