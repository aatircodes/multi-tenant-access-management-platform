package saas_access_platform.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateOrgSettingsRequest {

    @NotNull(message = "Request limit is required")
    @Min(value = 1, message = "Request limit must be at least 1 per minute")
    private Integer requestLimitPerMinute;
}