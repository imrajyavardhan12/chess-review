import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createBook, type BookData, type OpeningBook } from '../src/book'
import openings from '../src/data/openings.json'

export const fixturePath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
export const readFixture = <T>(name: string): T => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as T
export const realBook = (): OpeningBook => createBook(openings as unknown as BookData)
