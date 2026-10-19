package tw.typeweb;

import static org.springframework.http.HttpStatus.NOT_FOUND;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.ColumnMapRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class Store {
  private final JdbcTemplate db;
  private final boolean sqlServer;

  public Store(JdbcTemplate db, @Value("${app.database:postgresql}") String database) {
    this.db = db;
    this.sqlServer = "sqlserver".equals(database);
  }

  public JdbcTemplate jdbc() {
    return db;
  }

  public List<Map<String, Object>> list(String sql, Object... args) {
    return db.query(
        sql,
        new ColumnMapRowMapper() {
          @Override
          protected Object getColumnValue(ResultSet rs, int index) throws SQLException {
            if ("datetimeoffset".equalsIgnoreCase(rs.getMetaData().getColumnTypeName(index)))
              return rs.getObject(index, OffsetDateTime.class);
            return super.getColumnValue(rs, index);
          }
        },
        args);
  }

  public Map<String, Object> lockAttempt(long id, long member) {
    return one(
        sqlServer
            ? "SELECT * FROM attempts WITH (UPDLOCK, ROWLOCK) WHERE id=? AND member_id=?"
            : "SELECT * FROM attempts WHERE id=? AND member_id=? FOR UPDATE",
        id,
        member);
  }

  public String historyPagination() {
    return sqlServer ? " OFFSET ? ROWS FETCH NEXT 20 ROWS ONLY" : " LIMIT 20 OFFSET ?";
  }

  public Map<String, Object> one(String sql, Object... args) {
    var rows = list(sql, args);
    if (rows.isEmpty()) throw new ResponseStatusException(NOT_FOUND, "找不到資料");
    return rows.get(0);
  }

  public Map<String, Object> profile(long id) {
    return one("SELECT id,email,birthday,phone,name,nickname FROM members WHERE id=?", id);
  }
}
