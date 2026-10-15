import { useEffect, useMemo, useRef } from 'react'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getTeamRun,
  listTeamMessages,
  listTeamRuns,
  teamRunKeys,
} from '../api/teamRuns'
import { buildTeamRunView, toTeamRunHydrateSnapshot } from '../lib/teamRunView'
import { useExecutionActions, useExecutionStore } from '../stores/executionStore'

export function useTeamRuns(executionId: string) {
  return useQuery({
    queryKey: teamRunKeys.list(executionId),
    queryFn: () => listTeamRuns(executionId),
    enabled: Boolean(executionId),
  })
}

/**
 * 单个团队运行的实时视图。
 *
 * REST 详情与第一页消息到齐后 hydrate 一次到 `executionStore.teamRuns`
 * （store 已有 socket 数据时 hydrate 不生效）；此后运行状态、成员、预算、投递状态以 store 为准。
 * socket 推进到终态而 REST 详情仍为 running 时补拉一次详情与消息：
 * 结果、回合数与完整正文只有 REST 提供，补拉结果不回写 store。
 */
export function useTeamRunLive(teamRunId: string | null) {
  const queryClient = useQueryClient()
  const { hydrateTeamRun } = useExecutionActions()
  const live = useExecutionStore((state) =>
    teamRunId ? state.teamRuns[teamRunId] : undefined,
  )

  const detailQuery = useQuery({
    queryKey: teamRunKeys.detail(teamRunId ?? ''),
    queryFn: () => getTeamRun(teamRunId!),
    enabled: Boolean(teamRunId),
  })

  const messagesQuery = useInfiniteQuery({
    queryKey: teamRunKeys.messages(teamRunId ?? ''),
    queryFn: ({ pageParam }) => listTeamMessages(teamRunId!, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined,
    enabled: Boolean(teamRunId),
  })

  const detail = detailQuery.data
  const firstPage = messagesQuery.data?.pages[0]
  const hydratedRunIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (
      !teamRunId ||
      !detail ||
      !firstPage ||
      hydratedRunIdsRef.current.has(teamRunId)
    ) {
      return
    }
    hydratedRunIdsRef.current.add(teamRunId)
    hydrateTeamRun(teamRunId, toTeamRunHydrateSnapshot(detail, firstPage.data))
  }, [detail, firstPage, hydrateTeamRun, teamRunId])

  const liveStatus = live?.status
  useEffect(() => {
    if (
      !teamRunId ||
      !liveStatus ||
      liveStatus === 'running' ||
      detail?.status !== 'running'
    ) {
      return
    }
    // detail 前缀同时覆盖消息分页 key
    void queryClient.invalidateQueries({
      queryKey: teamRunKeys.detail(teamRunId),
    })
  }, [detail, liveStatus, queryClient, teamRunId])

  const pages = messagesQuery.data?.pages
  const view = useMemo(
    () =>
      buildTeamRunView(
        live,
        detail,
        (pages ?? []).flatMap((page) => page.data),
      ),
    [detail, live, pages],
  )

  return {
    view,
    detail,
    isLoading: detailQuery.isLoading,
    error: detailQuery.error,
    hasMoreMessages: messagesQuery.hasNextPage,
    isLoadingMoreMessages: messagesQuery.isFetchingNextPage,
    loadMoreMessages: messagesQuery.fetchNextPage,
  }
}
