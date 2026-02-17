import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

export class PrismaService {
	private static instance: PrismaClient

	public static getInstance(): PrismaClient {
		if (!PrismaService.instance) {
			const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db'

			const adapter = new PrismaLibSql({
				url: databaseUrl
			})

			PrismaService.instance = new PrismaClient({
				adapter,
				log: ['error', 'warn']
			})
		}
		return PrismaService.instance
	}

	public static async disconnect() {
		if (PrismaService.instance) {
			await PrismaService.instance.$disconnect()
		}
	}
}
