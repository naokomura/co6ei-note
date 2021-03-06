/**
 * original source: https://github.com/vercel/next.js/blob/canary/examples/blog-starter-typescript/lib/api.ts
 */
import fs from 'fs'
import { join } from 'path'
import matter from 'gray-matter'
import dayjs from 'dayjs'
import { hasProperty } from 'utils'
import { nonNullable } from 'utils/typeGuard'
import type { Post, PostCategory } from 'types/post'

export type PostFields = readonly [keyof Post, ...(keyof Post)[]]
export type ResultGetPost<T extends PostFields> = { [P in T[number]]: Post[P] }

const postsDirectory = join(process.cwd(), 'src', '_posts')
/**
 * _postsディレクトリ内のフォルダ名(YYYY-MM-DD)からハイフンを除いた文字配列を返す
 * @returns string[] | YYYYMMDD
 */
export const getPostSlugs = () => {
  const directoryNames = fs.readdirSync(postsDirectory)
  const slugs = directoryNames.map((directoryName) => {
    return directoryName.replace(/-/g, '')
  })
  return slugs
}

const postSlugToDirectoryName = (slug: string) => {
  // 取り除かれたハイフンを再結合してディレクトリ名を導く
  if (slug.length !== 10) return undefined
  const directoryName = [
    slug.slice(0, 4),
    '-',
    slug.slice(4, 6),
    '-',
    slug.slice(6, 8),
    '-',
    slug.slice(8, 10),
  ].join('')
  return directoryName
}

/**
 * @param slug getPostSlugs()から得た配列の内のひとつ
 * @param fields 呼び出し元で必要なだけのPostのプロパティを列挙する配列
 */
export const getPostBySlug = <R extends ResultGetPost<T>, T extends PostFields>(
  slug: string,
  fields: T
): R | undefined => {
  const directoryName = postSlugToDirectoryName(slug)
  if (directoryName === undefined) return undefined

  const fullPath = join(postsDirectory, directoryName, 'index.md')
  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matter(fileContents)

  // ブログポストであるmarkdownファイルにtype Postのrequiredなプロパティが存在するか確認し、存在しなければundefinedを返す
  const hasRequiredKeys = (data: Record<string, unknown>) => {
    return hasProperty(data, 'title') && hasProperty(data, 'date')
  }
  if (!hasRequiredKeys(data)) return undefined

  const unDuplicatedFields = [...new Set(fields)]
  const excerpt = content.replace(/\r?\n/g, '').slice(0, 120).concat(' …')

  // ここまで処理が進んだ時点で{}が{}のまま返ることは無いのでas Rとする
  let post = {} as R
  for (const field of unDuplicatedFields) {
    if (field === 'directoryName') {
      post = { ...post, [field]: directoryName }
      continue
    }
    if (field === 'slug') {
      post = { ...post, [field]: slug }
      continue
    }
    if (field === 'excerpt') {
      post = { ...post, [field]: excerpt }
      continue
    }
    if (field === 'content') {
      post = { ...post, [field]: content }
      continue
    }
    if (hasProperty(data, field)) {
      post = { ...post, [field]: data[field] }
      continue
    }
  }

  return post
}

export const getAllPosts = <R extends ResultGetPost<T>, T extends PostFields>(
  fields: T
): R[] => {
  const slugs = getPostSlugs()
  const posts = slugs
    .map((slug) => getPostBySlug(slug, fields))
    .filter(nonNullable)

  // dateプロパティを持つPostかを判別する型ガード
  const hasDateProperty = (
    posts: NonNullable<ResultGetPost<T>>[]
  ): posts is NonNullable<ResultGetPost<T> & { date: string }>[] => {
    return posts.every((post) => hasProperty(post, 'date'))
  }

  if (fields.includes('date') && hasDateProperty(posts)) {
    // dateに基づき降順に並べ替える
    posts.sort((postA, postB) => {
      const formatDateA = dayjs(postA.date).unix()
      const formatDateB = dayjs(postB.date).unix()
      return formatDateA > formatDateB ? -1 : 1
    })
  }

  return posts as R[]
}

export const getPostCategories = (): PostCategory[] => {
  const posts = getAllPosts(['categories'])
  const duplicatedCategories = posts.flatMap((post) => {
    return post.categories
  })
  // 重複をなくし一意なカテゴリーのみを残す
  const categoryNames = [...new Set(duplicatedCategories)]

  const categories = categoryNames
    .map((category) => {
      const sameNameCategories = duplicatedCategories.filter((dCategory) => {
        return dCategory === category
      })

      const name = category === undefined ? 'Uncategorized' : category
      return {
        name: name,
        // 日本語カテゴリーをエンコードしてもブラウザ側でデコードされてしまいgetStaticPathsのpathsと合致しないため、やむをえずエンコード後の文字列から'%'を省いている
        slug: encodeURI(name.toLowerCase()).replace(/%/g, ''),
        count: sameNameCategories.length,
      }
    })
    .sort((A, B) => {
      return A.count > B.count ? -1 : 1
    })

  return categories
}

export const getPostsByCategory = <
  R extends ResultGetPost<T>,
  T extends PostFields
>(
  name: string,
  fields: T
): R[] => {
  const posts = getAllPosts(['categories', 'slug', 'date'])
  const theCategoryIncludedPosts = posts
    .map((post) => {
      if (post.categories === undefined && name === 'Uncategorized') return post
      if (post.categories === undefined) return undefined
      if (post.categories.includes(name)) return post
    })
    .filter(nonNullable)

  const requestedPosts = theCategoryIncludedPosts
    .map((post) => {
      return getPostBySlug(post.slug, fields)
    })
    .filter(nonNullable)

  // dateプロパティを持つPostかを判別する型ガード
  const hasDateProperty = (
    posts: NonNullable<ResultGetPost<T>>[]
  ): posts is NonNullable<ResultGetPost<T> & { date: string }>[] => {
    return posts.every((post) => hasProperty(post, 'date'))
  }

  if (fields.includes('date') && hasDateProperty(requestedPosts)) {
    // dateに基づき降順に並べ替える
    posts.sort((postA, postB) => {
      const formatDateA = dayjs(postA.date).unix()
      const formatDateB = dayjs(postB.date).unix()
      return formatDateA > formatDateB ? -1 : 1
    })
  }

  return requestedPosts as R[]
}
