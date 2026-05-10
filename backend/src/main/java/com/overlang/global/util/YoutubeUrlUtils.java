package com.overlang.global.util;

import java.net.URI;

public final class YoutubeUrlUtils {

  private YoutubeUrlUtils() {}

  public static String extractVideoId(String url) {
    if (url == null || url.isBlank()) {
      throw new IllegalArgumentException("YouTube URL이 비어 있습니다.");
    }

    URI uri = URI.create(url);
    String host = uri.getHost();
    String path = uri.getPath();
    String query = uri.getQuery();

    if (host == null) {
      throw new IllegalArgumentException("올바른 YouTube URL이 아닙니다.");
    }

    if (host.contains("youtu.be")) {
      return extractFromShortUrl(path);
    }

    if (host.contains("youtube.com")) {
      String videoId = extractFromQuery(query);
      if (videoId != null) {
        return videoId;
      }

      return extractFromPath(path);
    }

    throw new IllegalArgumentException("YouTube videoId를 추출할 수 없습니다.");
  }

  private static String extractFromShortUrl(String path) {
    if (path != null && path.length() > 1) {
      return path.substring(1).split("/")[0];
    }

    throw new IllegalArgumentException("YouTube videoId를 추출할 수 없습니다.");
  }

  private static String extractFromQuery(String query) {
    if (query == null) {
      return null;
    }

    for (String param : query.split("&")) {
      String[] pair = param.split("=", 2);

      if (pair.length == 2 && pair[0].equals("v")) {
        return pair[1];
      }
    }

    return null;
  }

  private static String extractFromPath(String path) {
    if (path == null) {
      throw new IllegalArgumentException("YouTube videoId를 추출할 수 없습니다.");
    }

    if (path.startsWith("/shorts/")) {
      return path.replace("/shorts/", "").split("/")[0];
    }

    if (path.startsWith("/embed/")) {
      return path.replace("/embed/", "").split("/")[0];
    }

    throw new IllegalArgumentException("YouTube videoId를 추출할 수 없습니다.");
  }
}
