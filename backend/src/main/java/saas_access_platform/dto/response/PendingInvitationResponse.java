package saas_access_platform.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
@AllArgsConstructor
public class PendingInvitationResponse {
    private Long id;
    private String email;
    private String roleName;
    private String status;
    private LocalDateTime expiresAt;
}