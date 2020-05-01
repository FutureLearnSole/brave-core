/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const mediaType = 'youtube'

interface YoutubeVideoPathData {
  url: string
  channelId: string
  publisherKey: string
  title: string
}

interface YoutubeUserPathData {
  url: string
  channelId: string
  publisherKey: string
  mediaKey: string
  title: string
}

interface YoutubeChannelPathData {
  url: string
  channelId: string
  publisherKey: string
  favIconUrl: string
  title: string
}

interface YoutubeCustomPathData {
  url: string
  channelId: string
  publisherKey: string
  favIconUrl: string
  title: string
}

export interface PublisherInfoYoutube {
  pathType: 'video' | 'channel' | 'user' | 'custom',
  data: YoutubeVideoPathData | YoutubeUserPathData | YoutubeChannelPathData | YoutubeCustomPathData
}

const extractData = (data: string, matchAfter: string, matchUntil: string) => {
  if (data.length < matchAfter.length) {
    return ''
  }

  const matchPos = data.indexOf(matchAfter)
  if (matchPos === -1) {
    return ''
  }

  const startPos = matchPos + matchAfter.length
  const endPos = data.indexOf(matchUntil, startPos)

  let match = ''

  if (endPos !== startPos) {
    if (endPos !== -1 && endPos > startPos) {
      match = data.substring(startPos, endPos)
    } else if (endPos !== -1) {
      match = data.substring(startPos, endPos)
    } else {
      match = data.substring(startPos)
    }
  } else if (matchUntil === '') {
    match = data.substring(startPos)
  }

  return match
}

const getMediaDurationFromParts = (searchParams: URLSearchParams) => {
  const stParam = searchParams.get('st')
  const etParam = searchParams.get('et')
  if (!stParam || !etParam) {
    return 0
  }

  const startTimes = stParam.split(',')
  if (!startTimes || startTimes.length === 0) {
    return 0
  }

  const endTimes = etParam.split(',')
  if (!endTimes || endTimes.length === 0) {
    return 0
  }

  if (startTimes.length !== endTimes.length) {
    return 0
  }

  // Combine all of the intervals (should only be one set if there were no seeks)
  let duration = 0
  for (let i = 0; i < startTimes.length; ++i) {
    const st = parseFloat(startTimes[i])
    const et = parseFloat(endTimes[i])
    duration += Math.round(et - st)
  }

  return duration
}

const getMediaIdFromParts = (searchParams: URLSearchParams) => {
  return searchParams.get('docid') || ''
}

const getMediaKey = (mediaId: string) => {
  return `${mediaType}_${mediaId}`
}

const getMediaIdFromUrl = (url: URL) => {
  const searchParams = new URLSearchParams(url.search)
  if (!searchParams) {
    return ''
  }
  return searchParams.get('v')
}

const getVideoUrl = (mediaId: string) => {
  return `https://www.youtube.com/watch?v=${mediaId}`
}

const getPublisherKey = (key: string) => {
  return `${mediaType}#channel:${key}`
}

const getPublisherName = (data: string) => {
  const publisherNameJson = extractData(data, '"author":"', '"')
  if (!publisherNameJson) {
    return ''
  }

  let object = null
  try {
    object = JSON.parse(`{"brave_publisher":"${publisherNameJson}"}`)
  } catch (error) {
    throw new Error(`Error parsing publisher name from response: ${error}`)
  }

  return object.brave_publisher
}

const getFavIconUrl = (data: string) => {
  let match = extractData(data, '"avatar":{"thumbnails":[{"url":"', '"')
  if (match) {
    return match
  }
  match = extractData(data, '"width":88,"height":88},{"url":"', '"')
  if (match) {
    return match
  }
  return ''
}

const getChannelUrl = (publisherKey: string) => {
  return `https://www.youtube.com/channel/${publisherKey}`
}

const getChannelId = (data: string) => {
  let match = extractData(data, '"ucid":"', '"')
  if (match) {
    return match
  }
  match = extractData(data, 'HeaderRenderer":{"channelId":"', '"')
  if (match) {
    return match
  }
  match = extractData(data, '<link rel="canonical" href="https://www.youtube.com/channel/', '">')
  if (match) {
    return match
  }
  match = extractData(data, 'browseEndpoint":{"browseId":"', '"')
  if (match) {
    return match
  }
  return ''
}

const saveMediaVisitYoutubeVideo = (tabId: number, url: string, responseText: string, publisherName: string, publisherUrl: string) => {
  const favIconUrl = getFavIconUrl(responseText)
  const channelId = getChannelId(responseText)
  const publisherKey = getPublisherKey(channelId)

  const mediaId = getMediaIdFromUrl(new URL(url))
  if (!mediaId) {
    return
  }

  const mediaKey = getMediaKey(mediaId)

  let pubName = publisherName
  if (!pubName) {
    pubName = getPublisherName(responseText)
  }

  let pubUrl = publisherUrl
  if (!pubUrl) {
    pubUrl = getChannelUrl(channelId)
  }

  console.info('Visited a video url:')
  console.info(`  tabId=${tabId}`)
  console.info(`  url=${url}`)
  console.info(`  favIconUrl=${favIconUrl}`)
  console.info(`  channelId=${channelId}`)
  console.info(`  publisherName=${pubName}`)
  console.info(`  publisherUrl=${pubUrl}`)

  chrome.braveRewards.saveMediaVisitYoutubeVideo(
    tabId,
    pubUrl,
    channelId,
    publisherKey,
    mediaKey,
    favIconUrl,
    pubName)
}

const scrapePublisherInfo = (tabId: number, url: string) => {
  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`YouTube publisher request failed: ${response.statusText} (${response.status})`)
      }
      return response.text()
    })
    .then((responseText) => {
      saveMediaVisitYoutubeVideo(tabId, url, responseText, '', '')
    })
    .catch((error) => {
      throw new Error(`YouTube fetch request failed: ${error}`)
    })
}

const fetchPublisherInfoFromOembed = (tabId: number, url: string) => {
  const mediaId = getMediaIdFromUrl(new URL(url))
  if (!mediaId) {
    return
  }

  const videoUrl = getVideoUrl(mediaId)
  const encodedVideoUrl = encodeURI(videoUrl)

  const fetchData: any = {}

  fetch(`https://www.youtube.com/oembed?format=json&url=${encodedVideoUrl}`)
    .then((response) => {
      if (!response.ok) {
        if (response.status === 401) {
          // Embedding disabled; need to scrape data from page instead
          scrapePublisherInfo(tabId, url)
        } else {
          throw new Error(`YouTube oembed request failed: ${response.statusText} (${response.status})`)
        }
      }
      return response.json()
    })
    .then((responseJson) => {
      fetchData.publisherUrl = responseJson.author_url
      fetchData.publisherName = responseJson.author_name
      return fetch(fetchData.publisherUrl)
    })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`YouTube publisher request failed: ${response.statusText} (${response.status})`)
      }
      return response.text()
    })
    .then((responseText) => {
      saveMediaVisitYoutubeVideo(
        tabId,
        url,
        responseText,
        fetchData.publisherName,
        fetchData.publisherUrl)
    })
    .catch((error) => {
      throw new Error(`YouTube fetch request failed: ${error}`)
    })
}

const handleYoutubeChannelPathData = (tabId: number, data: YoutubeChannelPathData) => {
  console.info('Visited a channel url:')
  console.info(`  tabId=${tabId}`)
  console.info(`  url=${data.url}`)
  console.info(`  channelId=${data.channelId}`)
  console.info(`  publisherKey=${data.publisherKey}`)
  console.info(`  favIconUrl=${data.favIconUrl}`)
  console.info(`  title=${data.title}`)

  chrome.braveRewards.saveMediaVisitYoutubeChannel(
    tabId,
    data.url,
    data.channelId,
    data.publisherKey,
    data.favIconUrl,
    data.title)
}

const handleYoutubeUserPathData = (tabId: number, data: YoutubeUserPathData) => {
  console.info('Visited a user url:')
  console.info(`  tabId=${tabId}`)
  console.info(`  url=${data.url}`)
  console.info(`  channelId=${data.channelId}`)
  console.info(`  publisherKey=${data.publisherKey}`)
  console.info(`  mediaKey=${data.mediaKey}`)
  console.info(`  title=${data.title}`)

  chrome.braveRewards.saveMediaVisitYoutubeUser(
    tabId,
    data.url,
    data.channelId,
    data.publisherKey,
    data.mediaKey,
    data.title)
}

const handleYoutubeVideoPathData = (tabId: number, data: YoutubeVideoPathData) => {
  const mediaId = getMediaIdFromUrl(new URL(data.url))
  if (!mediaId) {
    return
  }

  const mediaKey = getMediaKey(mediaId)

  chrome.braveRewards.getMediaPublisherInfo(mediaKey, (result: number, info?: RewardsExtension.Publisher) => {
    console.debug(`getMediaPublisherInfo: result=${result}`)

    if (result === 0 && info) {
      console.debug(info)
      chrome.braveRewards.getPublisherPanelInfo(
        tabId,
        data.url,
        data.channelId,
        data.publisherKey,
        '', // favicon_url
        data.title)
      return
    }

    // No publisher info for this video, fetch it from oembed interface
    if (result === 9) {
      fetchPublisherInfoFromOembed(tabId, data.url)
      return
    }
  })
}

const handleYoutubeCustomPathData = (tabId: number, data: YoutubeCustomPathData) => {
  console.info('Visited a custom url:')
  console.info(`  tabId=${tabId}`)
  console.info(`  url=${data.url}`)
  console.info(`  channelId=${data.channelId}`)
  console.info(`  publisherKey=${data.publisherKey}`)
  console.info(`  favIconUrl=${data.favIconUrl}`)
  console.info(`  title=${data.title}`)

  chrome.braveRewards.saveMediaVisitYoutubeCustom(
    tabId,
    data.url,
    data.channelId,
    data.publisherKey,
    data.favIconUrl,
    data.title)
}

export const handlePublisherInfoYoutube = (publisherInfo: PublisherInfoYoutube, windowId: number, tabId: number) => {
  console.debug(`windowId=${windowId}, tabId=${tabId}`)
  switch (publisherInfo.pathType) {
    case 'channel': {
      const data = publisherInfo.data as YoutubeChannelPathData
      handleYoutubeChannelPathData(tabId, data)
      break
    }
    case 'user': {
      const data = publisherInfo.data as YoutubeUserPathData
      handleYoutubeUserPathData(tabId, data)
      break
    }
    case 'video': {
      const data = publisherInfo.data as YoutubeVideoPathData
      handleYoutubeVideoPathData(tabId, data)
      break
    }
    case 'custom': {
      const data = publisherInfo.data as YoutubeCustomPathData
      handleYoutubeCustomPathData(tabId, data)
      break
    }
  }
}

chrome.webRequest.onCompleted.addListener(
  // Listener
  function (details) {
    if (details) {
      const url = new URL(details.url)
      const searchParams = new URLSearchParams(url.search)

      const mediaId = getMediaIdFromParts(searchParams)
      const mediaKey = getMediaKey(mediaId)
      const duration = getMediaDurationFromParts(searchParams)

      chrome.braveRewards.getMediaPublisherInfo(mediaKey, (result: number, info?: RewardsExtension.Publisher) => {
        console.debug(`getMediaPublisherInfo: result=${result}`)

        if (result === 0 && info) {
          console.log(info)

          console.info('Updating media duration:')
          console.info(`  tabId=${details.tabId}`)
          console.info(`  url=${details.url}`)
          console.info(`  publisherKey=${info.publisher_key}`)
          console.info(`  mediaId=${mediaId}`)
          console.info(`  mediaKey=${mediaKey}`)
          console.info(`  favIconUrl=${info.favicon_url}`)
          console.info(`  title=${info.name}`)
          console.info(`  duration=${duration}`)

          chrome.braveRewards.updateMediaDuration(
            details.tabId,
            details.url,
            mediaType,
            info.publisher_key || '',
            mediaId,
            mediaKey,
            info.favicon_url || '',
            info.name || '',
            duration)
          return
        }

        // No publisher info for this video, fetch it from oembed interface
        if (result === 9) {
          fetchPublisherInfoFromOembed(details.tabId, details.url)
          return
        }
      })
    }
  },
  // Filters
  {
    types: [
      'image',
      'media',
      'script',
      'xmlhttprequest'
    ],
    urls: [
      'https://www.youtube.com/api/stats/watchtime?*'
    ]
  })
