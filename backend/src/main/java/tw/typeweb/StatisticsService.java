package tw.typeweb;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StatisticsService {
  private final Store store;

  public StatisticsService(Store store) {
    this.store = store;
  }

  public record Day(LocalDate date, Double average_cpm, int attempts) {}

  public record Trend(
      LocalDate from,
      LocalDate to,
      String mode,
      String zone,
      Double average_cpm,
      int attempts,
      List<Day> days) {}

  public record Average(String mode, Double average_cpm, Double average_wpm, int attempts) {}

  public record Group(long id, String title, Long course_id, List<Average> averages) {}

  public record Summary(
      LocalDate from,
      LocalDate to,
      String zone,
      List<Average> overall,
      List<Average> averages,
      List<Group> courses,
      List<Group> articles) {}

  private record Range(LocalDate from, LocalDate until, ZoneId zone) {}

  private Range range(String period, String date, String zoneName) {
    LocalDate anchor;
    ZoneId zone;
    try {
      anchor = LocalDate.parse(date);
      zone = ZoneId.of(zoneName);
    } catch (DateTimeException e) {
      throw new ResponseStatusException(BAD_REQUEST, "日期或時區無效");
    }
    if (anchor.getYear() < 1900 || anchor.getYear() > 9998)
      throw new ResponseStatusException(BAD_REQUEST, "日期無效");
    if ("all".equals(period)) return new Range(null, null, zone);
    LocalDate from =
        switch (period) {
          case "day" -> anchor;
          case "week" -> anchor.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
          case "month" -> anchor.withDayOfMonth(1);
          case "year" -> anchor.withDayOfYear(1);
          default -> throw new ResponseStatusException(BAD_REQUEST, "週期無效");
        };
    LocalDate until =
        switch (period) {
          case "day" -> from.plusDays(1);
          case "week" -> from.plusWeeks(1);
          case "month" -> from.plusMonths(1);
          default -> from.plusYears(1);
        };
    return new Range(from, until, zone);
  }

  private List<Average> averages(Map<String, DoubleSummaryStatistics> stats) {
    return List.of("zh", "en").stream()
        .map(
            mode -> {
              var value = stats.getOrDefault(mode, new DoubleSummaryStatistics());
              Double cpm = value.getCount() == 0 ? null : value.getAverage();
              return new Average(
                  mode,
                  cpm,
                  "en".equals(mode) && cpm != null ? cpm / 5 : null,
                  (int) value.getCount());
            })
        .toList();
  }

  public Summary summary(
      long member, String period, String date, String zoneName, Long course, Long article) {
    var range = range(period, date, zoneName);
    var overall = new HashMap<String, DoubleSummaryStatistics>();
    var selected = new HashMap<String, DoubleSummaryStatistics>();
    var courseStats = new TreeMap<Long, Map<String, DoubleSummaryStatistics>>();
    var articleStats = new TreeMap<Long, Map<String, DoubleSummaryStatistics>>();
    var courseNames = new HashMap<Long, String>();
    var articleNames = new HashMap<Long, String>();
    var articleCourses = new HashMap<Long, Long>();
    String sql =
        "SELECT p.finished_at,p.cpm,p.scoring_mode,a.id AS article_id,a.title AS article_title,c.id AS course_id,c.title AS course_title "
            + "FROM attempts p JOIN articles a ON a.id=p.article_id JOIN courses c ON c.id=a.course_id "
            + "WHERE p.member_id=? AND p.status='COMPLETED' AND p.scoring_mode IN ('zh','en') "
            + "AND p.cpm IS NOT NULL AND p.elapsed_ms>0 AND p.finished_at IS NOT NULL";
    store
        .jdbc()
        .query(
            sql,
            rs -> {
              String mode = rs.getString("scoring_mode");
              double speed = rs.getDouble("cpm");
              overall.computeIfAbsent(mode, key -> new DoubleSummaryStatistics()).accept(speed);
              long cid = rs.getLong("course_id"), aid = rs.getLong("article_id");
              if (course != null && course != cid || article != null && article != aid) return;
              LocalDate ended =
                  rs.getObject("finished_at", OffsetDateTime.class)
                      .atZoneSameInstant(range.zone())
                      .toLocalDate();
              if (range.from() != null
                  && (ended.isBefore(range.from()) || !ended.isBefore(range.until()))) return;
              selected.computeIfAbsent(mode, key -> new DoubleSummaryStatistics()).accept(speed);
              courseStats
                  .computeIfAbsent(cid, key -> new HashMap<>())
                  .computeIfAbsent(mode, key -> new DoubleSummaryStatistics())
                  .accept(speed);
              articleStats
                  .computeIfAbsent(aid, key -> new HashMap<>())
                  .computeIfAbsent(mode, key -> new DoubleSummaryStatistics())
                  .accept(speed);
              courseNames.put(cid, rs.getString("course_title"));
              articleNames.put(aid, rs.getString("article_title"));
              articleCourses.put(aid, cid);
            },
            member);
    var courses =
        courseStats.entrySet().stream()
            .map(
                e ->
                    new Group(
                        e.getKey(), courseNames.get(e.getKey()), null, averages(e.getValue())))
            .toList();
    var articles =
        articleStats.entrySet().stream()
            .map(
                e ->
                    new Group(
                        e.getKey(),
                        articleNames.get(e.getKey()),
                        articleCourses.get(e.getKey()),
                        averages(e.getValue())))
            .toList();
    return new Summary(
        range.from(),
        range.until() == null ? null : range.until().minusDays(1),
        range.zone().getId(),
        averages(overall),
        averages(selected),
        courses,
        articles);
  }

  public Trend daily(
      long member,
      String period,
      String date,
      String zoneName,
      String mode,
      Long course,
      Long article) {
    if (!Set.of("zh", "en").contains(mode) || "all".equals(period))
      throw new ResponseStatusException(BAD_REQUEST, "週期或打字類型無效");
    var range = range(period, date, zoneName);
    LocalDate from = range.from(), until = range.until();
    ZoneId zone = range.zone();
    String sql =
        "SELECT p.finished_at,p.cpm FROM attempts p JOIN articles a ON a.id=p.article_id "
            + "WHERE p.member_id=? AND p.scoring_mode=? AND p.status='COMPLETED' "
            + "AND p.cpm IS NOT NULL AND p.elapsed_ms>0 AND p.finished_at>=? AND p.finished_at<?";
    var args = new ArrayList<Object>();
    args.add(member);
    args.add(mode);
    args.add(from.atStartOfDay(zone).toOffsetDateTime());
    args.add(until.atStartOfDay(zone).toOffsetDateTime());
    if (course != null) {
      sql += " AND a.course_id=?";
      args.add(course);
    }
    if (article != null) {
      sql += " AND p.article_id=?";
      args.add(article);
    }
    var totals = new TreeMap<LocalDate, DoubleSummaryStatistics>();
    // Typed JDBC access handles both SQL Server datetimeoffset and PostgreSQL
    // timestamptz.
    store
        .jdbc()
        .query(
            sql,
            rs -> {
              LocalDate day =
                  rs.getObject("finished_at", OffsetDateTime.class)
                      .atZoneSameInstant(zone)
                      .toLocalDate();
              totals
                  .computeIfAbsent(day, key -> new DoubleSummaryStatistics())
                  .accept(rs.getDouble("cpm"));
            },
            args.toArray());
    var days = new ArrayList<Day>();
    var all = new DoubleSummaryStatistics();
    for (LocalDate day = from; day.isBefore(until); day = day.plusDays(1)) {
      var stats = totals.get(day);
      days.add(
          new Day(
              day,
              stats == null ? null : stats.getAverage(),
              stats == null ? 0 : (int) stats.getCount()));
      if (stats != null) all.combine(stats);
    }
    return new Trend(
        from,
        until.minusDays(1),
        mode,
        zone.getId(),
        all.getCount() == 0 ? null : all.getAverage(),
        (int) all.getCount(),
        days);
  }
}
