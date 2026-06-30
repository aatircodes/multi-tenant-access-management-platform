package saas_access_platform.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UsageResponse {

    private Long orgId;
    private int limitPerMinute;
    private double tokensRemaining;
}