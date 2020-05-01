/* Copyright (c) 2019 The Brave Authors. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "bat/ledger/internal/publisher/publisher_youtube.h"

#include <utility>

#include "bat/ledger/internal/ledger_impl.h"
#include "bat/ledger/internal/static_values.h"
#include "net/base/registry_controlled_domains/registry_controlled_domain.h"
#include "url/gurl.h"

using std::placeholders::_1;
using std::placeholders::_2;

namespace {

bool InitVisitData(
    const std::string& url,
    ledger::VisitData* visit_data) {
  DCHECK(visit_data);

  const GURL gurl(url);
  if (!gurl.is_valid()) {
    return false;
  }

  const GURL origin = gurl.GetOrigin();
  const std::string base_domain = GetDomainAndRegistry(
      origin.host(),
      net::registry_controlled_domains::INCLUDE_PRIVATE_REGISTRIES);
  if (base_domain.empty()) {
    return false;
  }

  visit_data->domain = base_domain;
  visit_data->name = base_domain;
  visit_data->path = gurl.PathForRequest();
  visit_data->url = origin.spec() + std::string(visit_data->path, 1);

  return true;
}

std::string GetChannelUrl(const std::string& publisher_key) {
  return "https://www.youtube.com/channel/" + publisher_key;
}

}  // namespace

namespace braveledger_publisher {

const char kProviderType[] = "youtube";

YouTube::YouTube(bat_ledger::LedgerImpl* ledger) : ledger_(ledger) {}

YouTube::~YouTube() {}

void YouTube::UpdateMediaDuration(
    const uint64_t window_id,
    const std::string& url,
    const std::string& publisher_key,
    const std::string& media_id,
    const std::string& media_key,
    const std::string& favicon_url,
    const std::string& title,
    uint64_t duration) {
  BLOG(1, "Media key: " << media_key);
  BLOG(1, "Media duration: " << duration);

  ledger::VisitData visit_data;
  visit_data.name = title;
  visit_data.url = url;
  visit_data.provider = kProviderType;
  visit_data.favicon_url = favicon_url;

  ledger_->SaveVideoVisit(
      publisher_key,
      visit_data,
      duration,
      window_id,
      [](ledger::Result, ledger::PublisherInfoPtr) {});
}

void YouTube::SaveMediaVisitYoutubeChannel(
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& favicon_url,
    const std::string& title) {
  BLOG(0, "DEBUG SaveMediaVisitYoutubeChannel: url=" << url
      << " favicon_url=" << favicon_url);

  if (publisher_key.empty()) {
    OnMediaActivityError(window_id, publisher_key);
    return;
  }

  GetPublisherPanelInfo(
      window_id,
      url,
      channel_id,
      publisher_key,
      favicon_url,
      title);
}

void YouTube::SaveMediaVisitYoutubeUser(
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& media_key,
    const std::string& title) {
  BLOG(0, "DEBUG SaveMediaVisitYoutubeUser: url=" << url
      << " title=" << title);
  ledger_->GetMediaPublisherInfo(
      media_key,
      [=](ledger::Result result, ledger::PublisherInfoPtr info) {
        HandleUserPathVisit(
            result,
            std::move(info),
            window_id,
            url,
            channel_id,
            publisher_key,
            media_key,
            title);
      });
}

void YouTube::HandleUserPathVisit(
    const ledger::Result result,
    ledger::PublisherInfoPtr info,
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& media_key,
    const std::string& title) {
  if (result != ledger::Result::LEDGER_OK &&
      result != ledger::Result::NOT_FOUND) {
    OnMediaActivityError(window_id, url);
    return;
  }

  if (result == ledger::Result::NOT_FOUND || !info) {
    ledger_->SaveMediaPublisherInfo(
        media_key,
        publisher_key,
        [=](const ledger::Result result) {
          SaveMediaVisitYoutubeChannel(
              window_id,
              GetChannelUrl(channel_id),
              channel_id,
              publisher_key,
              std::string(),
              title);
        });
    return;
  }

  SaveMediaVisitYoutubeChannel(
      window_id,
      GetChannelUrl(channel_id),
      channel_id,
      publisher_key,
      std::string(),
      title);
}

void YouTube::SaveMediaVisitYoutubeVideo(
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& media_key,
    const std::string& favicon_url,
    const std::string& title) {
  ledger::VisitData visit_data;
  if (!InitVisitData(url, &visit_data)) {
    BLOG(0, "Failed to initialize visit data for url " << url);
    return;
  }

  if (!favicon_url.empty()) {
    visit_data.favicon_url = favicon_url;
  }

  SavePublisherInfo(
      0,
      media_key,
      publisher_key,
      url,
      title,
      visit_data,
      window_id,
      visit_data.favicon_url,
      channel_id);
}

void YouTube::SaveMediaVisitYoutubeCustom(
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& favicon_url,
    const std::string& title) {
  ledger::VisitData visit_data;
  visit_data.path = "/channel/" + channel_id;

  if (!favicon_url.empty()) {
    visit_data.favicon_url = favicon_url;
  }

  GetPublisherPanelInfo(
      window_id,
      visit_data,
      channel_id,
      publisher_key,
      favicon_url,
      title);
}

void YouTube::SavePublisherInfo(
    const uint64_t duration,
    const std::string& media_key,
    const std::string& publisher_key,
    const std::string& publisher_url,
    const std::string& publisher_name,
    const ledger::VisitData& visit_data,
    uint64_t window_id,
    const std::string& favicon_url,
    const std::string& channel_id) {
  if (channel_id.empty()) {
    BLOG(0, "Channel id is missing for: " << media_key);
    return;
  }

  if (publisher_key.empty()) {
    BLOG(0, "Publisher key is missing for: " << media_key);
    return;
  }

  ledger::VisitData new_visit_data;
  new_visit_data.provider = kProviderType;
  new_visit_data.name = publisher_name;
  new_visit_data.url = publisher_url + "/videos";
  if (!favicon_url.empty()) {
    new_visit_data.favicon_url = favicon_url;
  }

  ledger_->SaveVideoVisit(
      publisher_key,
      new_visit_data,
      duration,
      window_id,
      [](const ledger::Result, ledger::PublisherInfoPtr) {});
  if (!media_key.empty()) {
    ledger_->SaveMediaPublisherInfo(
        media_key,
        publisher_key,
        [](const ledger::Result) {});
  }
}

void YouTube::GetPublisherPanelInfo(
    const uint64_t window_id,
    const std::string& url,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& favicon_url,
    const std::string& title) {
  BLOG(0, "DEBUG GetPublisherPanelInfo: url=" << url
      << " favicon_url=" << favicon_url);

  ledger::VisitData visit_data;
  if (!InitVisitData(url, &visit_data)) {
    BLOG(0, "Failed to initialize visit data for url " << url);
    return;
  }

  if (!favicon_url.empty()) {
    visit_data.favicon_url = favicon_url;
  }

  GetPublisherPanelInfo(
      window_id,
      visit_data,
      channel_id,
      publisher_key,
      favicon_url,
      title);
}

void YouTube::GetPublisherPanelInfo(
    const uint64_t window_id,
    const ledger::VisitData& visit_data,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& favicon_url,
    const std::string& title) {
  auto filter = ledger_->CreateActivityFilter(
      publisher_key,
      ledger::ExcludeFilter::FILTER_ALL,
      false,
      ledger_->GetReconcileStamp(),
      true,
      false);

  ledger_->GetPanelPublisherInfo(std::move(filter),
      std::bind(&YouTube::OnPanelPublisherInfo,
                this,
                window_id,
                visit_data,
                channel_id,
                publisher_key,
                title,
                _1,
                _2));
}

void YouTube::OnPanelPublisherInfo(
    uint64_t window_id,
    const ledger::VisitData& visit_data,
    const std::string& channel_id,
    const std::string& publisher_key,
    const std::string& title,
    const ledger::Result result,
    ledger::PublisherInfoPtr info) {
  BLOG(0, "DEBUG OnPanelPublisherInfo: url=" << visit_data.url
      << " favicon_url=" << visit_data.favicon_url);

  if (info && result != ledger::Result::NOT_FOUND) {
    BLOG(0, "DEBUG OnPanelPublisherInfo: calling into ledger");
    ledger_->ledger_client()->OnPanelPublisherInfo(
        result,
        std::move(info),
        window_id);
    return;
  }

  BLOG(0, "DEBUG OnPanelPublisherInfo: Calling SavePublisherInfo");

  SavePublisherInfo(
      0,
      std::string(),
      publisher_key,
      visit_data.url,
      title,
      visit_data,
      window_id,
      visit_data.favicon_url,
      channel_id);
}

void YouTube::OnMediaActivityError(
    const uint64_t window_id,
    const std::string& url) {
  const std::string tld_url = YOUTUBE_TLD;
  const std::string name = YOUTUBE_MEDIA_TYPE;

  if (!tld_url.empty()) {
    ledger::VisitData visit_data;
    visit_data.domain = tld_url;
    visit_data.url = "https://" + tld_url;
    visit_data.path = "/";
    visit_data.name = name;
    ledger_->GetPublisherActivityFromUrl(
        window_id, ledger::VisitData::New(visit_data), std::string());
  } else {
      BLOG(0, "Media activity error for " << YOUTUBE_MEDIA_TYPE << " (name: "
          << name << ", url: " << url << ")");
  }
}

}  // namespace braveledger_publisher
