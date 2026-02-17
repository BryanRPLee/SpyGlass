import { CrawlStatus, PrismaClient } from '@prisma/client'
import { MatchHistoryService } from './matchHistoryService'
import { PlayerProfileService } from './playerProfileService'
import { MatchStorageService } from './matchStorageService'
import { PrismaService } from './prismaService'

interface TaskResult {
	taskId: string
	playerId: string
	status: 'completed' | 'failed' | 'rate_limited' | 'invalid_account'
	error?: string
}

export class ViralCrawlerService {
	private prisma: PrismaClient
	private matchHistoryService: MatchHistoryService
	private playerProfileService: PlayerProfileService
	private matchStorageService: MatchStorageService
	private isRunning = false
	private intervalMs: number
	private batchSize: number
	private maxRetries: number
	private concurrencyLimit: number
	private minDelayMs: number
	private rateLimitBackoffMs: number

	constructor(
		matchHistoryService: MatchHistoryService,
		playerProfileService: PlayerProfileService,
		intervalMs = 1000,
		batchSize = 20,
		maxRetries = 3,
		concurrencyLimit = 10,
		minDelayMs = 500,
		rateLimitBackoffMs = 30000
	) {
		this.prisma = PrismaService.getInstance()
		this.matchHistoryService = matchHistoryService
		this.playerProfileService = playerProfileService
		this.matchStorageService = new MatchStorageService()
		this.intervalMs = intervalMs
		this.batchSize = batchSize
		this.maxRetries = maxRetries
		this.concurrencyLimit = concurrencyLimit
		this.minDelayMs = minDelayMs
		this.rateLimitBackoffMs = rateLimitBackoffMs
	}

	public async seed(steamIds: string[]) {
		console.log(`Seeding crawler with ${steamIds.length} player(s)`)

		const crawlQueueOperations = steamIds.map((steamId) =>
			this.prisma.crawlQueue.upsert({
				where: { playerId: steamId },
				create: {
					playerId: steamId,
					priority: 100,
					status: CrawlStatus.PENDING
				},
				update: {
					priority: 100,
					status: CrawlStatus.PENDING
				}
			})
		)

		const playerOperations = steamIds.map((steamId) =>
			this.prisma.player.upsert({
				where: { id: steamId },
				create: {
					id: steamId
				},
				update: {
					lastSeen: new Date()
				}
			})
		)

		await Promise.all([...crawlQueueOperations, ...playerOperations])

		console.log(`Seeded ${steamIds.length} players to crawl queue`)
	}

	public async start() {
		if (this.isRunning) {
			console.log('Crawler is already running')
			return
		}

		this.isRunning = true
		console.log('Starting viral crawler...')
		console.log(
			`Config: batchSize=${this.batchSize}, concurrency=${this.concurrencyLimit}, interval=${this.intervalMs}ms`
		)
		this.crawlLoop()
	}

	public stop(): void {
		console.log('Stopping viral crawler...')
		this.isRunning = false
	}

	private async crawlLoop() {
		while (this.isRunning) {
			try {
				await this.processBatch()
				await this.logStats()
				await this.sleep(this.intervalMs)
			} catch (error) {
				console.error('Error in crawl loop:', error)
				await this.sleep(this.intervalMs * 2)
			}
		}
	}

	private async processBatch() {
		const tasks = await this.prisma.crawlQueue.findMany({
			where: {
				status: CrawlStatus.PENDING,
				attempts: { lt: this.maxRetries }
			},
			orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
			take: this.batchSize
		})

		if (tasks.length === 0) {
			console.log('No pending tasks, waiting...')
			return
		}

		console.log(`Processing batch of ${tasks.length} tasks`)

		await Promise.all(
			tasks.map((task) =>
				this.prisma.crawlQueue.update({
					where: { id: task.id },
					data: {
						status: CrawlStatus.IN_PROGRESS,
						attempts: { increment: 1 },
						lastAttempt: new Date()
					}
				})
			)
		)

		const results = await this.processTasksWithConcurrency(tasks)
		await this.batchUpdateTaskResults(results)

		const rateLimitedCount = results.filter(
			(r) => r.status === 'rate_limited'
		).length
		if (rateLimitedCount > 0) {
			console.log(
				`Rate limited on ${rateLimitedCount} tasks, backing off for ${this.rateLimitBackoffMs / 1000}s...`
			)
			await this.sleep(this.rateLimitBackoffMs)
		}
	}

	private async processTasksWithConcurrency(
		tasks: Array<{
			id: string
			playerId: string
			attempts: number
		}>
	): Promise<TaskResult[]> {
		const results: TaskResult[] = []
		const chunks = this.chunkArray(tasks, this.concurrencyLimit)

		for (const chunk of chunks) {
			const chunkResults = await Promise.allSettled(
				chunk.map((task) => this.processSingleTask(task))
			)

			chunkResults.forEach((result, index) => {
				if (result.status === 'fulfilled') {
					results.push(result.value)
				} else {
					results.push({
						taskId: chunk[index].id,
						playerId: chunk[index].playerId,
						status: 'failed',
						error: result.reason?.message || 'Unknown error'
					})
				}
			})

			if (chunks.length > 1) {
				await this.sleep(this.minDelayMs)
			}
		}

		return results
	}

	private async processSingleTask(task: {
		id: string
		playerId: string
		attempts: number
	}): Promise<TaskResult> {
		try {
			await this.crawlPlayer(task.playerId)
			console.log(`✓ Completed crawl for player ${task.playerId}`)
			return {
				taskId: task.id,
				playerId: task.playerId,
				status: 'completed'
			}
		} catch (error: any) {
			console.error(
				`✗ Error crawling player ${task.playerId}:`,
				error.message
			)

			const isRateLimited =
				error.message?.includes('RATE') ||
				error.message?.includes('timeout')
			const isInvalidAccount =
				error.message?.includes('timeout') && task.attempts >= 1

			let status: TaskResult['status'] = 'failed'
			if (isInvalidAccount) {
				status = 'invalid_account'
				console.log(`  └─ Skipping invalid/private account`)
			} else if (isRateLimited) {
				status = 'rate_limited'
				console.log(`  └─ Rate limited`)
			}

			return {
				taskId: task.id,
				playerId: task.playerId,
				status,
				error: error.message
			}
		}
	}

	private async batchUpdateTaskResults(results: TaskResult[]) {
		const completed = results
			.filter((r) => r.status === 'completed')
			.map((r) => r.taskId)
		const failed = results
			.filter((r) => r.status === 'failed')
			.map((r) => r.taskId)
		const rateLimited = results
			.filter((r) => r.status === 'rate_limited')
			.map((r) => r.taskId)
		const invalidAccounts = results
			.filter((r) => r.status === 'invalid_account')
			.map((r) => r.taskId)

		await Promise.all([
			completed.length > 0
				? this.prisma.crawlQueue.updateMany({
						where: { id: { in: completed } },
						data: { status: CrawlStatus.COMPLETED }
					})
				: Promise.resolve(),
			failed.length > 0
				? this.prisma.crawlQueue.updateMany({
						where: { id: { in: failed } },
						data: { status: CrawlStatus.FAILED }
					})
				: Promise.resolve(),
			rateLimited.length > 0
				? this.prisma.crawlQueue.updateMany({
						where: { id: { in: rateLimited } },
						data: { status: CrawlStatus.RATE_LIMITED }
					})
				: Promise.resolve(),
			invalidAccounts.length > 0
				? this.prisma.crawlQueue.updateMany({
						where: { id: { in: invalidAccounts } },
						data: { status: CrawlStatus.FAILED }
					})
				: Promise.resolve()
		])

		const resultsWithErrors = results.filter((r) => r.error)
		if (resultsWithErrors.length > 0) {
			await Promise.all(
				resultsWithErrors.map((r) =>
					this.prisma.crawlQueue.update({
						where: { id: r.taskId },
						data: { error: r.error }
					})
				)
			)
		}

		console.log(
			`Batch results: ✓ ${completed.length} | ✗ ${failed.length} | ⏸ ${rateLimited.length} | ⊗ ${invalidAccounts.length}`
		)
	}

	private async crawlPlayer(steamId: string) {
		console.log(`Crawling player ${steamId}...`)

		const [profile, matches] = await Promise.all([
			this.playerProfileService
				.getPlayerProfile(steamId)
				.catch((error) => {
					console.warn(
						`  └─ Could not fetch profile for ${steamId}:`,
						error.message
					)
					return null
				}),
			this.matchHistoryService.getPlayerMatchHistory(steamId)
		])

		if (profile) {
			await this.matchStorageService.storePlayerProfile(steamId, profile)
		}

		console.log(
			`  └─ Found ${matches.length} matches for player ${steamId}`
		)

		if (matches.length > 0) {
			await Promise.all(
				matches.map((match) =>
					this.matchStorageService.storeMatch(match, steamId)
				)
			)
		}
	}

	private async logStats() {
		const [crawlStats, queueStats] = await Promise.all([
			this.matchStorageService.getCrawlStats(),
			this.prisma.crawlQueue.groupBy({
				by: ['status'],
				_count: true
			})
		])

		const queueSummary = queueStats.reduce(
			(acc, stat) => {
				acc[stat.status] = stat._count
				return acc
			},
			{} as Record<string, number>
		)

		console.log('=== Crawler Stats ===')
		console.log(`Total Players: ${crawlStats.totalPlayers}`)
		console.log(`Total Matches: ${crawlStats.totalMatches}`)
		console.log(
			`Avg Matches/Player: ${crawlStats.avgMatchesPerPlayer.toFixed(2)}`
		)
		console.log('Queue Status:', queueSummary)
		console.log('=====================')

		await this.prisma.crawlStats.create({
			data: {
				totalPlayers: crawlStats.totalPlayers,
				totalMatches: crawlStats.totalMatches,
				pendingCrawls: queueSummary[CrawlStatus.PENDING] || 0,
				failedCrawls: queueSummary[CrawlStatus.FAILED] || 0,
				avgMatchesPerPlayer: crawlStats.avgMatchesPerPlayer
			}
		})
	}

	private chunkArray<T>(array: T[], chunkSize: number): T[][] {
		const chunks: T[][] = []
		for (let i = 0; i < array.length; i += chunkSize) {
			chunks.push(array.slice(i, i + chunkSize))
		}
		return chunks
	}

	private sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}
}
