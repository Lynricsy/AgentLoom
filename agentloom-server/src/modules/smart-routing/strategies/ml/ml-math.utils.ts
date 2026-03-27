function assertRectangularMatrix(matrix: number[][], label: string): void {
  if (matrix.length === 0) {
    return;
  }

  const expectedColumns = matrix[0]?.length ?? 0;
  for (const row of matrix) {
    if (row.length !== expectedColumns) {
      throw new Error(`${label} must be a rectangular matrix`);
    }
  }
}

export function matmul(a: number[][], b: number[][]): number[][] {
  assertRectangularMatrix(a, 'Matrix A');
  assertRectangularMatrix(b, 'Matrix B');

  if (a.length === 0 || b.length === 0) {
    return [];
  }

  const aColumns = a[0]?.length ?? 0;
  const bRows = b.length;
  const bColumns = b[0]?.length ?? 0;

  if (aColumns !== bRows) {
    throw new Error('Matrix dimensions do not align for multiplication');
  }

  return a.map((row) =>
    Array.from({ length: bColumns }, (_, columnIndex) =>
      row.reduce(
        (sum, value, valueIndex) =>
          sum + value * (b[valueIndex]?.[columnIndex] ?? 0),
        0,
      ),
    ),
  );
}

export function relu(x: number[]): number[] {
  return x.map((value) => (value > 0 ? value : 0));
}

export function softmax(x: number[], temperature: number = 1): number[] {
  if (x.length === 0) {
    return [];
  }

  if (temperature <= 0) {
    throw new Error('Softmax temperature must be greater than 0');
  }

  const scaled = x.map((value) => value / temperature);
  const maxValue = Math.max(...scaled);
  const exponentials = scaled.map((value) => Math.exp(value - maxValue));
  const sum = exponentials.reduce((total, value) => total + value, 0);

  return exponentials.map((value) => value / sum);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension');
  }

  const dotProduct = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
  const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

export function eloExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

export function eloUpdateRating(
  rating: number,
  expected: number,
  actual: number,
  k: number,
): number {
  return rating + k * (actual - expected);
}
