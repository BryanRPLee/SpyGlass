import { SteamClient } from '../clients/steamClient'
import { PlayerProfile } from '../models/player'
import SteamID from 'steamid'

export class PlayerProfileService {
	private steamClient: SteamClient

	constructor(steamClient: SteamClient) {
		this.steamClient = steamClient
	}

	public async getPlayerProfile(
		steamId: string
	): Promise<PlayerProfile | null> {
		if (!this.steamClient.hasGCSession()) {
			throw new Error('Not connected to GC')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				csgo.removeListener('playersProfile', handler)
				console.warn(`No profile received for ${steamId}`)
				resolve(null)
			}, 30000)
			const csgo = this.steamClient.getCSGOClient()

			const handler = (profile: PlayerProfile) => {
				clearTimeout(timeout)
				csgo.removeListener('playersProfile', handler)
				resolve(profile || null)
			}

			csgo.once('playersProfile', handler)
			try {
				const sid = new SteamID(steamId)
				csgo.requestPlayersProfile(sid)
			} catch (err) {
				clearTimeout(timeout)
				csgo.removeListener('playersProfile', handler)
				reject(err)
			}
		})
	}
}
