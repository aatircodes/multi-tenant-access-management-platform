package saas_access_platform.dto.response;

import lombok.Builder;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Builder
public class RoleResponse {
    private Long id;
    private String name;
    private Long orgId;
    private LocalDateTime createdAt;
    private long memberCount;
}