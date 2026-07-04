package saas_access_platform.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InvitationLookupResponse {
    private String email;
    private String orgName;
    private String roleName;
    private LocalDateTime expiresAt;
}