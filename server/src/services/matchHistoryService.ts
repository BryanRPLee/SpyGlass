import { SteamClient } from '../clients/steamClient'
import SteamID from 'steamid'

export interface Match {
	matchid?: string
	matchtime?: number
	watchablematchinfo?: any
	roundstatsall?: any[]
}

export class MatchHistoryService {
	private steamClient: SteamClient

	constructor(steamClient: SteamClient) {
		this.steamClient = steamClient
	}

	public async getPlayerMatchHistory(steamId: string): Promise<Match[]> {
		if (!this.steamClient.hasGCSession()) {
			throw new Error('Not connected to GC')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Request timeout')),
				10000
			)
			const csgo = this.steamClient.getCSGOClient()

			const handler = (matches: Match[]) => {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)
				resolve(matches || [])
			}

			csgo.once('matchList', handler)
			try {
				csgo.requestRecentGames(steamId)
			} catch (err) {
				clearTimeout(timeout)
				csgo.removeListener('matchList', handler)
				reject(err)
			}
		})
	}

	public parseSteamID(steamId: string): SteamID {
		try {
			return new SteamID(steamId)
		} catch (err) {
			throw new Error('Invalid SteamID')
		}
	}
}
