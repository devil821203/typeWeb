package tw.typeweb;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApiTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired Store store;

  // Existing scoring tests use the original six articles as stable fixtures.
  @BeforeEach
  void legacyCatalogueFixture() {
    store.jdbc().update("UPDATE articles SET archived=CASE WHEN id<1000 THEN 0 ELSE 1 END");
  }

  @AfterEach
  void restoreImportedCatalogue() {
    store.jdbc().update("UPDATE articles SET archived=CASE WHEN id<1000 THEN 1 ELSE 0 END");
  }

  @Test
  void generatedCataloguePreservesHistory() throws Exception {
    var owner = signup();
    mvc.perform(
            post("/api/attempts")
                .session(owner)
                .with(csrf())
                .contentType("application/json")
                .content("{\"articleId\":1}"))
        .andExpect(status().isCreated());
    restoreImportedCatalogue();
    mvc.perform(get("/api/articles"))
        .andExpect(jsonPath("$.length()").value(200))
        .andExpect(jsonPath("$[0].id").value(1001))
        .andExpect(jsonPath("$[0].content").doesNotExist());
    for (int cid = 10; cid <= 15; cid++) {
      mvc.perform(get("/api/articles?courseId=" + cid))
          .andExpect(jsonPath("$.length()").value(cid < 14 ? 30 : 40));
    }
    mvc.perform(get("/api/articles?courseId=1")).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/articles/1001"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.language").value("zh"))
        .andExpect(jsonPath("$.difficulty").value("beginner"));
    mvc.perform(get("/api/attempts").session(owner))
        .andExpect(jsonPath("$[0].article_title").value("A quiet morning"))
        .andExpect(
            jsonPath("$[0].content_snapshot")
                .value(store.one("SELECT content FROM articles WHERE id=1").get("content")));
    assertEquals(
        200,
        store
            .jdbc()
            .queryForObject(
                "SELECT COUNT(*) FROM articles WHERE id>=1001 AND id<=1200", Integer.class));
    assertEquals(
        6,
        store
            .jdbc()
            .queryForObject(
                "SELECT COUNT(*) FROM articles WHERE id<1000 AND archived=1", Integer.class));
  }

  String body(Object value) throws Exception {
    return json.writeValueAsString(value);
  }

  MockHttpSession signup() throws Exception {
    String email = UUID.randomUUID() + "@example.com";
    String payload =
        body(
            Map.of(
                "email",
                email,
                "password",
                "secure-password",
                "birthday",
                "1995-06-15",
                "phone",
                "0912345678",
                "name",
                "Test",
                "nickname",
                "Tester"));
    mvc.perform(
            post("/api/auth/register")
                .with(csrf())
                .contentType("application/json")
                .content(payload))
        .andExpect(status().isCreated());
    mvc.perform(
            post("/api/auth/register")
                .with(csrf())
                .contentType("application/json")
                .content(payload))
        .andExpect(status().isConflict());
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        body(Map.of("email", email.toUpperCase(), "password", "secure-password"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.password_hash").doesNotExist())
            .andReturn()
            .getRequest()
            .getSession();
  }

  @Test
  void publicAccessAndCsrf() throws Exception {
    mvc.perform(get("/api/health")).andExpect(status().isOk());
    mvc.perform(get("/api/courses")).andExpect(jsonPath("$.length()").value(9));
    mvc.perform(get("/api/articles"))
        .andExpect(jsonPath("$.length()").value(6))
        .andExpect(jsonPath("$[0].content").doesNotExist());
    mvc.perform(get("/api/articles/1")).andExpect(status().isOk());
    mvc.perform(get("/api/articles/4")).andExpect(status().isForbidden());
    mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/attempts")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/csrf")).andExpect(jsonPath("$.token").isNotEmpty());
    mvc.perform(post("/api/auth/register").contentType("application/json").content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/auth/register").with(csrf()).contentType("application/json").content("{}"))
        .andExpect(status().isBadRequest());
    mvc.perform(
            post("/api/auth/login")
                .with(csrf())
                .contentType("application/json")
                .content(body(Map.of("email", "none@example.com", "password", "wrong"))))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void memberLifecycleAndRecordIsolation() throws Exception {
    var owner = signup();
    var other = signup();
    mvc.perform(get("/api/articles/4").session(owner)).andExpect(status().isOk());
    mvc.perform(
            put("/api/me")
                .session(owner)
                .with(csrf())
                .contentType("application/json")
                .content(
                    body(
                        Map.of(
                            "birthday",
                            "1995-06-15",
                            "phone",
                            "+886912345678",
                            "name",
                            "Updated",
                            "nickname",
                            "New"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.nickname").value("New"));
    String result =
        mvc.perform(
                post("/api/attempts")
                    .session(owner)
                    .with(csrf())
                    .contentType("application/json")
                    .content("{\"articleId\":1}"))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    long id = json.readTree(result).get("id").asLong();
    mvc.perform(
            put("/api/attempts/" + id)
                .session(other)
                .with(csrf())
                .contentType("application/json")
                .content("{\"typedText\":\"x\",\"completed\":false}"))
        .andExpect(status().isNotFound());
    mvc.perform(
            put("/api/attempts/" + id)
                .session(owner)
                .with(csrf())
                .contentType("application/json")
                .content("{\"typedText\":\"x\",\"completed\":true}"))
        .andExpect(status().isBadRequest());
    String content = (String) store.one("SELECT content FROM articles WHERE id=1").get("content");
    mvc.perform(
            put("/api/attempts/" + id)
                .session(owner)
                .with(csrf())
                .contentType("application/json")
                .content(body(Map.of("typedText", content, "completed", true))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COMPLETED"))
        .andExpect(jsonPath("$.accuracy").value(100.0));
    mvc.perform(
            put("/api/attempts/" + id)
                .session(owner)
                .with(csrf())
                .contentType("application/json")
                .content("{\"typedText\":\"changed\",\"completed\":false}"))
        .andExpect(jsonPath("$.status").value("COMPLETED"));
    mvc.perform(get("/api/attempts?courseId=1&articleId=1").session(owner))
        .andExpect(jsonPath("$.length()").value(1));
    mvc.perform(get("/api/attempts?courseId=2").session(owner))
        .andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/attempts").session(other)).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(get("/api/attempts?page=-1").session(owner)).andExpect(status().isBadRequest());
    mvc.perform(post("/api/auth/logout").session(owner).with(csrf())).andExpect(status().isOk());
    assertTrue(owner.isInvalid());
  }

  @Test
  void abandonedAttemptPreservesInput() throws Exception {
    var session = signup();
    var response =
        mvc.perform(
                post("/api/attempts")
                    .session(session)
                    .with(csrf())
                    .contentType("application/json")
                    .content("{\"articleId\":3}"))
            .andReturn()
            .getResponse();
    long id = json.readTree(response.getContentAsString()).get("id").asLong();
    mvc.perform(get("/api/attempts").session(session))
        .andExpect(jsonPath("$[0].status").value("IN_PROGRESS"));
    mvc.perform(
            put("/api/attempts/" + id)
                .session(session)
                .with(csrf())
                .contentType("application/json")
                .content(body(Map.of("typedText", "午後", "completed", false))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ABANDONED"))
        .andExpect(jsonPath("$.typed_text").value("午後"));
  }

  @Test
  void browserCsrfTokenWorksAcrossLogin() throws Exception {
    var tokenResult = mvc.perform(get("/api/csrf")).andExpect(status().isOk()).andReturn();
    var session = (MockHttpSession) tokenResult.getRequest().getSession();
    var csrfData = json.readTree(tokenResult.getResponse().getContentAsString());
    String header = csrfData.get("headerName").asText(), token = csrfData.get("token").asText();
    String email = UUID.randomUUID() + "@example.com";
    mvc.perform(
            post("/api/auth/register")
                .session(session)
                .header(header, token)
                .contentType("application/json")
                .content(
                    body(
                        Map.of(
                            "email",
                            email,
                            "password",
                            "secure-password",
                            "birthday",
                            "1995-06-15",
                            "phone",
                            "0912345678",
                            "name",
                            "Browser",
                            "nickname",
                            "Browser"))))
        .andExpect(status().isCreated());
    String previousId = session.getId();
    mvc.perform(
            post("/api/auth/login")
                .session(session)
                .header(header, token)
                .contentType("application/json")
                .content(body(Map.of("email", email, "password", "secure-password"))))
        .andExpect(status().isOk());
    assertNotEquals(previousId, session.getId());
    mvc.perform(
            post("/api/attempts")
                .session(session)
                .header(header, token)
                .contentType("application/json")
                .content("{\"articleId\":1}"))
        .andExpect(status().isCreated());
    mvc.perform(get("/api/me").session(session)).andExpect(jsonPath("$.email").value(email));
  }

  @Test
  void unicodeScoring() {
    var score = TypingService.score("你🌞好", "你🌞錯", 60000);
    assertEquals(2, score.correctChars());
    assertEquals(2, score.cpm());
    assertEquals(0.4, score.wpm());
    assertEquals(200.0 / 3, score.accuracy());
    assertEquals(0, TypingService.score("a", "", 0).accuracy());
  }

  @Test
  void chineseAnalysisIsValidatedSavedAndReturnedInHistory() throws Exception {
    var session = signup();
    var response =
        mvc.perform(
                post("/api/attempts")
                    .session(session)
                    .with(csrf())
                    .contentType("application/json")
                    .content(body(Map.of("articleId", 3))))
            .andExpect(jsonPath("$.scoring_mode").value("zh"))
            .andReturn()
            .getResponse();
    long id = json.readTree(response.getContentAsString()).get("id").asLong();
    var analysis =
        Map.of(
            "backspaces",
            2,
            "selectionErrors",
            1,
            "frequentWords",
            java.util.List.of(Map.of("word", "午後", "count", 1)),
            "firstCpm",
            60,
            "lastCpm",
            48,
            "declinePercent",
            20);
    mvc.perform(
            put("/api/attempts/" + id)
                .session(session)
                .with(csrf())
                .contentType("application/json")
                .content(
                    body(
                        Map.of(
                            "typedText",
                            "午後",
                            "completed",
                            false,
                            "chineseMetrics",
                            Map.of("backspaces", -1, "frequentWords", java.util.List.of())))))
        .andExpect(status().isBadRequest());
    String content = (String) store.one("SELECT content FROM articles WHERE id=3").get("content");
    var saved =
        mvc.perform(
                put("/api/attempts/" + id)
                    .session(session)
                    .with(csrf())
                    .contentType("application/json")
                    .content(
                        body(
                            Map.of(
                                "typedText",
                                content,
                                "completed",
                                true,
                                "chineseMetrics",
                                analysis))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.wpm").isEmpty())
            .andExpect(jsonPath("$.accuracy").value(100.0))
            .andReturn()
            .getResponse();
    var row = json.readTree(saved.getContentAsString());
    long counted =
        content
            .codePoints()
            .filter(
                c ->
                    Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN
                        || c == '，'
                        || c == '。')
            .count();
    assertEquals(
        counted * 60000.0 / row.get("elapsed_ms").asLong(), row.get("cpm").asDouble(), 0.001);
    assertEquals(2, json.readTree(row.get("chinese_metrics").asText()).get("backspaces").asInt());
    mvc.perform(get("/api/attempts").session(session))
        .andExpect(jsonPath("$[0].chinese_metrics").value(row.get("chinese_metrics").asText()));
    mvc.perform(
            put("/api/attempts/" + id)
                .session(session)
                .with(csrf())
                .contentType("application/json")
                .content(body(Map.of("typedText", "", "completed", false))))
        .andExpect(jsonPath("$.chinese_metrics").value(row.get("chinese_metrics").asText()));
    mvc.perform(get("/api/articles"))
        .andExpect(jsonPath("$[0].language").value("en"))
        .andExpect(jsonPath("$[2].language").value("zh"))
        .andExpect(jsonPath("$[2].content").doesNotExist());
  }

  @Test
  void punctuationScoring() {
    "你𠀀，。！？；：、（）「」『』【】〔〕［］｛｝〈〉《》—…“”"
        .codePoints()
        .forEach(
            c -> assertTrue(TypingService.chineseScorable(c), new String(Character.toChars(c))));
    ",.!? A１　🌞".codePoints().forEach(c -> assertFalse(TypingService.chineseScorable(c)));
    var english = TypingService.score("Hi, world!", "Hi, world!", 60000);
    assertEquals(10, english.cpm());
    assertEquals(2, english.wpm());
    assertEquals(100, english.accuracy());
    assertEquals(200.0 / 3, TypingService.score("Hi!", "Hi?", 60000).accuracy());
  }

  void dailyFixture(
      MockHttpSession session, long article, String mode, String status, String ended, double cpm) {
    var time = java.time.OffsetDateTime.parse(ended);
    store
        .jdbc()
        .update(
            "INSERT INTO attempts(member_id,article_id,content_snapshot,started_at,finished_at,elapsed_ms,cpm,status,scoring_mode) VALUES (?,?,?,?,?,?,?,?,?)",
            session.getAttribute("memberId"),
            article,
            "fixture",
            time.minusMinutes(1),
            time,
            60000,
            cpm,
            status,
            mode);
  }

  @Test
  void dailyTrendsAggregateAllRowsAndRespectTimezoneModeAndOwner() throws Exception {
    var owner = signup();
    var other = signup();
    dailyFixture(owner, 3, "zh", "COMPLETED", "2026-09-15T15:59:00Z", 30);
    dailyFixture(owner, 3, "zh", "ABANDONED", "2026-09-15T15:59:30Z", 90);
    for (int i = 0; i < 23; i++)
      dailyFixture(owner, 3, "zh", "COMPLETED", "2026-09-15T16:00:00Z", 60);
    dailyFixture(owner, 1, "en", "COMPLETED", "2026-09-15T16:00:00Z", 500);
    dailyFixture(owner, 3, "zh", "IN_PROGRESS", "2026-09-15T16:00:00Z", 999);
    dailyFixture(owner, 3, null, "COMPLETED", "2026-09-15T16:00:00Z", 999);
    dailyFixture(other, 3, "zh", "COMPLETED", "2026-09-15T16:00:00Z", 999);
    String url = "/api/attempts/daily?period=week&date=2026-09-16&zone=Asia/Taipei&mode=zh";
    mvc.perform(get(url)).andExpect(status().isUnauthorized());
    mvc.perform(get(url).session(owner))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.from").value("2026-09-14"))
        .andExpect(jsonPath("$.to").value("2026-09-20"))
        .andExpect(jsonPath("$.days.length()").value(7))
        .andExpect(jsonPath("$.attempts").value(24))
        .andExpect(jsonPath("$.average_cpm").value(58.75))
        .andExpect(jsonPath("$.days[0].average_cpm").isEmpty())
        .andExpect(jsonPath("$.days[1].average_cpm").value(30.0))
        .andExpect(jsonPath("$.days[1].attempts").value(1))
        .andExpect(jsonPath("$.days[2].attempts").value(23));
    mvc.perform(get(url + "&courseId=1").session(owner)).andExpect(jsonPath("$.attempts").value(0));
    mvc.perform(get(url + "&articleId=4").session(owner))
        .andExpect(jsonPath("$.attempts").value(0));
    mvc.perform(get(url.replace("mode=zh", "mode=en")).session(owner))
        .andExpect(jsonPath("$.average_cpm").value(500.0));
    mvc.perform(get(url.replace("Asia/Taipei", "UTC")).session(owner))
        .andExpect(jsonPath("$.days[1].attempts").value(24));
    mvc.perform(get(url).session(other)).andExpect(jsonPath("$.attempts").value(1));
  }

  @Test
  void dailyTrendsCalendarBoundsAndValidation() throws Exception {
    var session = signup();
    mvc.perform(get("/api/attempts/daily?period=month&date=2024-02-29").session(session))
        .andExpect(jsonPath("$.days.length()").value(29))
        .andExpect(jsonPath("$.to").value("2024-02-29"));
    mvc.perform(get("/api/attempts/daily?period=year&date=2024-06-01").session(session))
        .andExpect(jsonPath("$.days.length()").value(366))
        .andExpect(jsonPath("$.average_cpm").isEmpty());
    dailyFixture(session, 3, "zh", "COMPLETED", "2026-01-01T00:00:00Z", 0);
    mvc.perform(get("/api/attempts/daily?period=year&date=2026-01-01&zone=UTC").session(session))
        .andExpect(jsonPath("$.days.length()").value(365))
        .andExpect(jsonPath("$.days[0].average_cpm").value(0.0))
        .andExpect(jsonPath("$.days[0].attempts").value(1));
    for (String query :
        java.util.List.of(
            "date=2026-02-30",
            "date=2026-01-01&period=bad",
            "date=2026-01-01&mode=bad",
            "date=2026-01-01&zone=bad",
            "date=9999-01-01"))
      mvc.perform(get("/api/attempts/daily?" + query).session(session))
          .andExpect(status().isBadRequest());
    dailyFixture(session, 3, "zh", "COMPLETED", "2026-03-09T03:59:00Z", 10);
    dailyFixture(session, 3, "zh", "COMPLETED", "2026-03-09T04:00:00Z", 20);
    mvc.perform(
            get("/api/attempts/daily?period=week&date=2026-03-08&zone=America/New_York")
                .session(session))
        .andExpect(jsonPath("$.attempts").value(1))
        .andExpect(jsonPath("$.days[6].average_cpm").value(10.0));
  }

  @Test
  void statisticsSummarySeparatesModesGroupsPeriodsAndMembers() throws Exception {
    var owner = signup();
    var other = signup();
    for (int i = 0; i < 23; i++)
      dailyFixture(owner, 3, "zh", "COMPLETED", "2026-10-06T16:00:00Z", 60);
    dailyFixture(owner, 3, "zh", "COMPLETED", "2025-01-01T00:00:00Z", 120);
    dailyFixture(owner, 1, "en", "COMPLETED", "2026-10-07T00:00:00Z", 250);
    dailyFixture(owner, 2, "en", "COMPLETED", "2026-10-07T00:00:00Z", 350);
    dailyFixture(owner, 3, "zh", "ABANDONED", "2026-10-07T00:00:00Z", 999);
    dailyFixture(owner, 3, null, "COMPLETED", "2026-10-07T00:00:00Z", 999);
    dailyFixture(owner, 3, "zh", "IN_PROGRESS", "2026-10-07T00:00:00Z", 999);
    dailyFixture(other, 3, "zh", "COMPLETED", "2026-10-07T00:00:00Z", 999);
    String url = "/api/statistics?date=2026-10-07&zone=Asia/Taipei";
    mvc.perform(get(url)).andExpect(status().isUnauthorized());
    mvc.perform(get(url).session(owner))
        .andExpect(jsonPath("$.from").isEmpty())
        .andExpect(jsonPath("$.overall[0].attempts").value(24))
        .andExpect(jsonPath("$.overall[0].average_cpm").value(62.5))
        .andExpect(jsonPath("$.overall[0].average_wpm").isEmpty())
        .andExpect(jsonPath("$.overall[1].average_wpm").value(60.0))
        .andExpect(jsonPath("$.averages[1].attempts").value(2))
        .andExpect(jsonPath("$.articles.length()").value(3));
    for (String period : java.util.List.of("day", "week", "month", "year")) {
      mvc.perform(get(url + "&period=" + period + "&articleId=3").session(owner))
          .andExpect(jsonPath("$.averages[0].attempts").value(23))
          .andExpect(jsonPath("$.averages[0].average_cpm").value(60.0))
          .andExpect(jsonPath("$.averages[1].average_cpm").isEmpty())
          .andExpect(jsonPath("$.overall[0].attempts").value(24))
          .andExpect(jsonPath("$.courses.length()").value(1))
          .andExpect(jsonPath("$.articles[0].id").value(3));
    }
    mvc.perform(get(url + "&period=day").session(owner))
        .andExpect(jsonPath("$.from").value("2026-10-07"))
        .andExpect(jsonPath("$.to").value("2026-10-07"));
    mvc.perform(get(url.replace("Asia/Taipei", "UTC") + "&period=day").session(owner))
        .andExpect(status().isOk());
    mvc.perform(get(url + "&courseId=1&articleId=3").session(owner))
        .andExpect(jsonPath("$.averages[0].attempts").value(0))
        .andExpect(jsonPath("$.articles.length()").value(0))
        .andExpect(jsonPath("$.overall[0].attempts").value(24));
    mvc.perform(get(url).session(other)).andExpect(jsonPath("$.overall[0].attempts").value(1));
    var empty = signup();
    mvc.perform(get(url).session(empty))
        .andExpect(jsonPath("$.overall[0].average_cpm").isEmpty())
        .andExpect(jsonPath("$.overall[1].attempts").value(0))
        .andExpect(jsonPath("$.courses.length()").value(0));
    for (String query :
        java.util.List.of(
            "date=2026-02-30", "date=2026-01-01&period=bad", "date=2026-01-01&zone=bad"))
      mvc.perform(get("/api/statistics?" + query).session(owner))
          .andExpect(status().isBadRequest());
    mvc.perform(get("/api/attempts/daily?period=day&date=2026-10-07&mode=zh").session(owner))
        .andExpect(jsonPath("$.days.length()").value(1))
        .andExpect(jsonPath("$.attempts").value(23));
  }

  @Test
  void articleSummariesExposeMetadataAndOnlyTheCurrentMembersAverages() throws Exception {
    var owner = signup();
    var other = signup();
    dailyFixture(owner, 1, "en", "COMPLETED", "2026-10-07T00:00:00Z", 250);
    dailyFixture(owner, 1, "en", "COMPLETED", "2026-10-07T00:00:00Z", 350);
    dailyFixture(owner, 1, "en", "ABANDONED", "2026-10-07T00:00:00Z", 999);
    dailyFixture(owner, 1, null, "COMPLETED", "2026-10-07T00:00:00Z", 999);
    dailyFixture(owner, 1, "zh", "COMPLETED", "2026-10-07T00:00:00Z", 999);
    dailyFixture(owner, 2, "en", "COMPLETED", "2026-10-07T00:00:00Z", 0);
    dailyFixture(owner, 3, "zh", "COMPLETED", "2026-10-07T00:00:00Z", 60);
    dailyFixture(other, 1, "en", "COMPLETED", "2026-10-07T00:00:00Z", 1000);
    mvc.perform(get("/api/articles"))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(jsonPath("$[0].personal_average_cpm").isEmpty())
        .andExpect(jsonPath("$[0].personal_attempts").value(0))
        .andExpect(jsonPath("$[0].content").doesNotExist())
        .andExpect(jsonPath("$[0].character_count").value(73))
        .andExpect(jsonPath("$[0].difficulty").value("beginner"))
        .andExpect(jsonPath("$[2].difficulty").value("intermediate"))
        .andExpect(jsonPath("$[4].difficulty").value("advanced"));
    mvc.perform(get("/api/articles").session(owner))
        .andExpect(jsonPath("$[0].personal_average_cpm").value(300.0))
        .andExpect(jsonPath("$[0].personal_average_wpm").value(60.0))
        .andExpect(jsonPath("$[0].personal_attempts").value(2))
        .andExpect(jsonPath("$[1].personal_average_cpm").value(0.0))
        .andExpect(jsonPath("$[2].personal_average_wpm").isEmpty())
        .andExpect(jsonPath("$[2].personal_average_cpm").value(60.0));
    mvc.perform(get("/api/articles?courseId=2").session(owner))
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].id").value(3))
        .andExpect(jsonPath("$[1].personal_attempts").value(0));
    mvc.perform(get("/api/articles").session(other))
        .andExpect(jsonPath("$[0].personal_average_cpm").value(1000.0));
    String content = (String) store.one("SELECT content FROM articles WHERE id=1").get("content");
    try {
      store.jdbc().update("UPDATE articles SET content=? WHERE id=1", "你🌞 a");
      mvc.perform(get("/api/articles?courseId=1"))
          .andExpect(jsonPath("$[0].character_count").value(4));
      mvc.perform(get("/api/articles/1")).andExpect(jsonPath("$.character_count").value(4));
    } finally {
      store.jdbc().update("UPDATE articles SET content=? WHERE id=1", content);
    }
  }
}
