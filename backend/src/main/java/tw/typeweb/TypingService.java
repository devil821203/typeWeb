package tw.typeweb;

import static org.springframework.http.HttpStatus.*;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TypingService {
  private final Store store;
  private final com.fasterxml.jackson.databind.ObjectMapper json;

  public TypingService(Store store, com.fasterxml.jackson.databind.ObjectMapper json) {
    this.store = store;
    this.json = json;
  }

  public static String language(String text) {
    return text.codePoints()
            .anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN)
        ? "zh"
        : "en";
  }

  public static boolean chineseScorable(int c) {
    int type = Character.getType(c);
    boolean punctuation =
        type == Character.CONNECTOR_PUNCTUATION
            || type == Character.DASH_PUNCTUATION
            || type == Character.START_PUNCTUATION
            || type == Character.END_PUNCTUATION
            || type == Character.INITIAL_QUOTE_PUNCTUATION
            || type == Character.FINAL_QUOTE_PUNCTUATION
            || type == Character.OTHER_PUNCTUATION;
    return Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN
        || (punctuation
            && ((c >= 0x3000 && c <= 0x303f)
                || (c >= 0xff01 && c <= 0xff60)
                || "—–…‧‘’“”".indexOf(c) >= 0));
  }

  public Map<String, Object> article(long id, Long member) {
    var article =
        store.one(
            "SELECT id,course_id,title,content,members_only,difficulty FROM articles WHERE id=?",
            id);
    if (Boolean.TRUE.equals(article.get("members_only")) && member == null)
      throw new ResponseStatusException(FORBIDDEN, "請先登入會員");
    article.put("language", language((String) article.get("content")));
    String content = (String) article.get("content");
    article.put("character_count", content.codePointCount(0, content.length()));
    return article;
  }

  @Transactional
  public Map<String, Object> start(long member, long article) {
    var data = article(article, member);
    var key = new org.springframework.jdbc.support.GeneratedKeyHolder();
    store
        .jdbc()
        .update(
            connection -> {
              var stmt =
                  connection.prepareStatement(
                      "INSERT INTO attempts(member_id,article_id,content_snapshot,started_at,scoring_mode) VALUES (?,?,?,?,?)",
                      new String[] {"id"});
              stmt.setLong(1, member);
              stmt.setLong(2, article);
              stmt.setString(3, (String) data.get("content"));
              stmt.setObject(4, OffsetDateTime.now(ZoneOffset.UTC));
              stmt.setString(5, language((String) data.get("content")));
              return stmt;
            },
            key);
    return store.one("SELECT * FROM attempts WHERE id=?", key.getKey().longValue());
  }

  public record Score(int correctChars, double cpm, double wpm, double accuracy) {}

  public static Score score(String expected, String typed, long elapsed) {
    int[] a = expected.codePoints().toArray(), b = typed.codePoints().toArray();
    int correct = 0;
    for (int i = 0; i < Math.min(a.length, b.length); i++) if (a[i] == b[i]) correct++;
    double cpm = correct * 60000.0 / Math.max(1, elapsed);
    return new Score(correct, cpm, cpm / 5, b.length == 0 ? 0 : correct * 100.0 / b.length);
  }

  @Transactional
  public Map<String, Object> finish(long member, long id, Models.Finish input) {
    var row = store.lockAttempt(id, member);
    if (!"IN_PROGRESS".equals(row.get("status"))) return row;
    String expected = (String) row.get("content_snapshot");
    if (input.completed() && !expected.equals(input.typedText()))
      throw new ResponseStatusException(BAD_REQUEST, "輸入與文章相同才可完成");
    var started =
        store
            .jdbc()
            .queryForObject("SELECT started_at FROM attempts WHERE id=?", OffsetDateTime.class, id);
    var now = OffsetDateTime.now(ZoneOffset.UTC);
    long elapsed = Math.max(1, Duration.between(started, now).toMillis());
    var score = score(expected, input.typedText(), elapsed);
    boolean chinese = "zh".equals(row.get("scoring_mode"));
    double cpm = score.cpm();
    if (chinese) {
      int[] a = expected.codePoints().toArray(), b = input.typedText().codePoints().toArray();
      int correct = 0;
      for (int i = 0; i < Math.min(a.length, b.length); i++)
        if (a[i] == b[i] && chineseScorable(a[i])) correct++;
      cpm = correct * 60000.0 / elapsed;
    }
    String chineseMetrics = null;
    if (chinese && input.chineseMetrics() != null) {
      try {
        chineseMetrics = json.writeValueAsString(input.chineseMetrics());
      } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
        throw new IllegalStateException(e);
      }
    }
    store
        .jdbc()
        .update(
            "UPDATE attempts SET finished_at=?,elapsed_ms=?,typed_text=?,correct_chars=?,cpm=?,wpm=?,accuracy=?,status=? WHERE id=?",
            now,
            elapsed,
            input.typedText(),
            score.correctChars(),
            cpm,
            chinese ? null : score.wpm(),
            score.accuracy(),
            input.completed() ? "COMPLETED" : "ABANDONED",
            id);
    store.jdbc().update("UPDATE attempts SET chinese_metrics=? WHERE id=?", chineseMetrics, id);
    return store.one("SELECT * FROM attempts WHERE id=?", id);
  }
}
