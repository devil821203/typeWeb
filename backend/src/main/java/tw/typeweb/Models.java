package tw.typeweb;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public final class Models {
  private Models() {}

  public record Register(
      @NotBlank @Email @Size(max = 254) String email,
      @NotBlank @Size(min = 10, max = 72) String password,
      @NotNull @Past LocalDate birthday,
      @NotBlank @Pattern(regexp = "[+0-9() -]{6,30}") String phone,
      @NotBlank @Size(max = 80) String name,
      @NotBlank @Size(max = 80) String nickname) {}

  public record Login(@NotBlank @Email String email, @NotBlank @Size(max = 72) String password) {}

  public record Profile(
      @NotNull @Past LocalDate birthday,
      @NotBlank @Pattern(regexp = "[+0-9() -]{6,30}") String phone,
      @NotBlank @Size(max = 80) String name,
      @NotBlank @Size(max = 80) String nickname) {}

  public record WrongWord(
      @NotBlank @Size(max = 200) String word, @Min(1) @Max(1000000) int count) {}

  public record ChineseMetrics(
      @Min(0) @Max(1000000) int backspaces,
      @Min(0) @Max(1000000) int selectionErrors,
      @NotNull @Size(max = 5)
          java.util.List<@NotNull @jakarta.validation.Valid WrongWord> frequentWords,
      @DecimalMin("0") @DecimalMax("1000000") Double firstCpm,
      @DecimalMin("0") @DecimalMax("1000000") Double lastCpm,
      @DecimalMin("-100000000") @DecimalMax("100") Double declinePercent) {}

  public record Finish(
      @NotNull @Size(max = 20000) String typedText,
      boolean completed,
      @jakarta.validation.Valid ChineseMetrics chineseMetrics) {}

  public record Start(@Positive long articleId) {}
}
