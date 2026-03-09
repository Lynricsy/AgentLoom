import { Injectable } from '@nestjs/common';
import type { ReactFlowEdge, ReactFlowNode } from '../../database/schema';
import { CyclicGraphException } from './execution.exceptions';

export interface DagExecutionPlan {
  layers: string[][];
  adjacencyMap: Map<string, string[]>;
  inDegreeMap: Map<string, number>;
}

@Injectable()
export class DagResolverService {
  resolveDag(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): DagExecutionPlan {
    const adjacencyMap = new Map<string, string[]>();
    const inDegreeMap = new Map<string, number>();

    for (const node of nodes) {
      adjacencyMap.set(node.id, []);
      inDegreeMap.set(node.id, 0);
    }

    for (const edge of edges) {
      adjacencyMap.get(edge.source)?.push(edge.target);
      inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) ?? 0) + 1);
    }

    const originalInDegreeMap = new Map(inDegreeMap);

    const layers: string[][] = [];
    const workingDegrees = new Map(inDegreeMap);
    let queue = [...workingDegrees.entries()]
      .filter(([, degree]) => degree === 0)
      .map(([nodeId]) => nodeId);

    let processedCount = 0;

    while (queue.length > 0) {
      layers.push([...queue]);
      processedCount += queue.length;

      const nextQueue: string[] = [];
      for (const nodeId of queue) {
        for (const neighbor of adjacencyMap.get(nodeId) ?? []) {
          const newDegree = (workingDegrees.get(neighbor) ?? 0) - 1;
          workingDegrees.set(neighbor, newDegree);
          if (newDegree === 0) {
            nextQueue.push(neighbor);
          }
        }
      }
      queue = nextQueue;
    }

    if (processedCount !== nodes.length) {
      throw new CyclicGraphException();
    }

    return { layers, adjacencyMap, inDegreeMap: originalInDegreeMap };
  }
}
