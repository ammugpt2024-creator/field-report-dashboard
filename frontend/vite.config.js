/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Database target by git branch, resolved at build time.
//
//   main            → PRODUCTION Supabase project
//   any other branch (feature / Roopa / Hari / Indra / …) → DEV project
//
// Vercel exposes the deployed branch as VERCEL_GIT_COMMIT_REF, so feature/dev
// deployments automatically point at the dev database and never touch
// production. An explicit VITE_SUPABASE_URL (e.g. .env.development for
// `npm run dev`, or a Vercel env var) still takes precedence over this default.
const DB = {
  dev: {
    url: 'https://ksuejjehwgofhcajinjh.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdWVqamVod2dvZmhjYWppbmpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTkzMDQsImV4cCI6MjA5NTIzNTMwNH0.58_0P3-nVgUF1bJoG07IX3NQQwiMpgCybgcqS-yadWY'
  },
  prod: {
    url: 'https://tjuahoyhjgefpeklyvzi.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdWFob3loamdlZnBla2x5dnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMDA4NTQsImV4cCI6MjA5NDc3Njg1NH0.UQCITJ5AMyosArTpI8LAb8FNo3UqfT1_OXAVHW3ef7s'
  }
}

const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GIT_BRANCH || ''
const target = branch === 'main' || branch === 'master' ? DB.prod : DB.dev

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __DB_URL__: JSON.stringify(target.url),
    __DB_ANON_KEY__: JSON.stringify(target.anonKey),
    __DB_TARGET__: JSON.stringify(target === DB.prod ? 'production' : 'dev'),
    __DB_BRANCH__: JSON.stringify(branch || 'local')
  }
})
