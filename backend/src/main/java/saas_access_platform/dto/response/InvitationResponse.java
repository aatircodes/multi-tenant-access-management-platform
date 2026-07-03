package saas_access_platform.dto.response;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class InvitationResponse {
    private Long id;
    private String token;
    private String email;
    private LocalDateTime expiresAt;
}