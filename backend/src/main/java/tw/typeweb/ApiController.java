package tw.typeweb;

import static org.springframework.http.HttpStatus.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ApiController {
  private final Store store;
  private final TypingService typing;
  private final PasswordEncoder passwords;
  private final String dummy;
  private final StatisticsService statistics;

  public ApiController(
      Store store, TypingService typing, PaFsswordEncoder passwords, StatisticsService statistics) {
    this.statistics = statistics;
    this.store = store;
    this.typing = typing;
    this.passwords = passwords;
    dummy = passwords.encode("dummy-password");
  }

  private Long member(HttpServletRequest r) {
    var s = r.getSession(false);
    return s == null ? null : (Long) s.getAttribute("memberId");
  }

  private long required(HttpServletRequest r) {
    Long id = member(r);
    if (id == null) throw new ResponseStatusException(UNAUTHORIZED, "請先登入");
    return id;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    store.jdbc().queryForObject("SELECT 1", Integer.class);
    return Map.of("status", "UP");
  }

  @GetMapping("/csrf")
  public Map<String, String> csrf(CsrfToken token) {
    return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
  }

  @PostMapping("/auth/register")
  @ResponseStatus(CREATED)
  public Map<String, Object> register(@Valid @RequestBody Models.Register data) {
    if (data.password().getBytes(StandardCharsets.UTF_8).length > 72)
      throw new ResponseStatusException(BAD_REQUEST, "密碼不可超過 72 UTF-8 bytes");
    String email = data.email().trim().toLowerCase(Locale.ROOT);
    try {
      store
          .jdbc()
          .update(
              "INSERT INTO members(email,password_hash,birthday,phone,name,nickname) VALUES (?,?,?,?,?,?)",
              email,
              passwords.encode(data.password()),
              data.birthday(),
              data.phone(),
              data.name(),
              data.nickname());
    } catch (DuplicateKeyException e) {
      throw new ResponseStatusException(CONFLICT, "此 Email 已註冊");
    }
    return Map.of("message", "註冊成功，請登入");
  }

  @PostMapping("/auth/login")
  public Map<String, Object> login(@Valid @RequestBody Models.Login data, HttpServletRequest r) {
    var rows =
        store
            .jdbc()
            .queryForList(
                "SELECT id,password_hash FROM members WHERE email=?",
                data.email().trim().toLowerCase(Locale.ROOT));
    String hash = rows.isEmpty() ? dummy : (String) rows.get(0).get("password_hash");
    if (data.password().getBytes(StandardCharsets.UTF_8).length > 72
        || !passwords.matches(data.password(), hash)
        || rows.isEmpty()) throw new ResponseStatusException(UNAUTHORIZED, "Email 或密碼錯誤");
    r.getSession();
    r.changeSessionId();
    long id = ((Number) rows.get(0).get("id")).longValue();
    r.getSession().setAttribute("memberId", id);
    return store.profile(id);
  }

  @PostMapping("/auth/logout")
  public void logout(HttpServletRequest r) {
    if (r.getSession(false) != null) r.getSession().invalidate();
  }

  @GetMapping("/me")
  public Map<String, Object> me(HttpServletRequest r) {
    return store.profile(required(r));
  }

  @PutMapping("/me")
  public Map<String, Object> update(@Valid @RequestBody Models.Profile data, HttpServletRequest r) {
    long id = required(r);
    store
        .jdbc()
        .update(
            "UPDATE members SET birthday=?,phone=?,name=?,nickname=? WHERE id=?",
            data.birthday(),
            data.phone(),
            data.name(),
            data.nickname(),
            id);
    return store.profile(id);
  }

  @GetMapping("/courses")
  public List<Map<String, Object>> courses() {
    return store.jdbc().queryForList("SELECT * FROM courses ORDER BY id");
  }

  @GetMapping("/articles")
  public List<Map<String, Object>> articles(
      @RequestParam(required = false) Long courseId,
      HttpServletRequest request,
      HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
    var rows =
        courseId == null
            ? store
                .jdbc()
                .queryForList(
                    "SELECT id,course_id,title,members_only,content,difficulty FROM articles WHERE archived=0 ORDER BY id")
            : store
                .jdbc()
                .queryForList(
                    "SELECT id,course_id,title,members_only,content,difficulty FROM articles WHERE archived=0 AND course_id=? ORDER BY id",
                    courseId);
    Long owner = member(request);
    var averages = new HashMap<String, Map<String, Object>>();
    if (owner != null) {
      String sql =
          "SELECT article_id,scoring_mode,AVG(cpm) AS average_cpm,COUNT(*) AS attempts FROM attempts "
              + "WHERE member_id=? AND status='COMPLETED' AND finished_at IS NOT NULL AND elapsed_ms>0 "
              + "AND cpm IS NOT NULL AND scoring_mode IN ('zh','en') GROUP BY article_id,scoring_mode";
      for (var stats : store.jdbc().queryForList(sql, owner))
        averages.put(stats.get("article_id") + ":" + stats.get("scoring_mode"), stats);
    }
    for (var row : rows) {
      String content = (String) row.remove("content"), mode = TypingService.language(content);
      row.put("language", mode);
      row.put("character_count", content.codePointCount(0, content.length()));
      var stats = averages.get(row.get("id") + ":" + mode);
      Double cpm = stats == null ? null : ((Number) stats.get("average_cpm")).doubleValue();
      row.put("personal_average_cpm", cpm);
      row.put("personal_average_wpm", "en".equals(mode) && cpm != null ? cpm / 5 : null);
      row.put("personal_attempts", stats == null ? 0 : ((Number) stats.get("attempts")).intValue());
    }
    return rows;
  }

  @GetMapping("/articles/{id}")
  public Map<String, Object> article(@PathVariable long id, HttpServletRequest r) {
    return typing.article(id, member(r));
  }

  @PostMapping("/attempts")
  @ResponseStatus(CREATED)
  public Map<String, Object> start(@Valid @RequestBody Models.Start data, HttpServletRequest r) {
    return typing.start(required(r), data.articleId());
  }

  @PutMapping("/attempts/{id}")
  public Map<String, Object> finish(
      @PathVariable long id, @Valid @RequestBody Models.Finish data, HttpServletRequest r) {
    return typing.finish(required(r), id, data);
  }

  @GetMapping("/statistics")
  public StatisticsService.Summary statistics(
      HttpServletRequest r,
      @RequestParam(defaultValue = "all") String period,
      @RequestParam String date,
      @RequestParam(defaultValue = "Asia/Taipei") String zone,
      @RequestParam(required = false) Long courseId,
      @RequestParam(required = false) Long articleId) {
    return statistics.summary(required(r), period, date, zone, courseId, articleId);
  }

  @GetMapping("/attempts/daily")
  public StatisticsService.Trend daily(
      HttpServletRequest r,
      @RequestParam(defaultValue = "week") String period,
      @RequestParam String date,
      @RequestParam(defaultValue = "Asia/Taipei") String zone,
      @RequestParam(defaultValue = "zh") String mode,
      @RequestParam(required = false) Long courseId,
      @RequestParam(required = false) Long articleId) {
    return statistics.daily(required(r), period, date, zone, mode, courseId, articleId);
  }

  @GetMapping("/attempts")
  public List<Map<String, Object>> history(
      HttpServletRequest r,
      @RequestParam(required = false) Long courseId,
      @RequestParam(required = false) Long articleId,
      @RequestParam(defaultValue = "0") int page) {
    if (page < 0 || page > 1000000) throw new ResponseStatusException(BAD_REQUEST, "頁碼無效");
    String sql =
        "SELECT p.*,a.title AS article_title,c.title AS course_title FROM attempts p JOIN articles a ON a.id=p.article_id JOIN courses c ON c.id=a.course_id WHERE p.member_id=?";
    var args = new ArrayList<Object>();
    args.add(required(r));
    if (courseId != null) {
      sql += " AND c.id=?";
      args.add(courseId);
    }
    if (articleId != null) {
      sql += " AND a.id=?";
      args.add(articleId);
    }
    sql += " ORDER BY p.started_at DESC,p.id DESC" + store.historyPagination();
    args.add(page * 20);
    return store.list(sql, args.toArray());
  }
}
